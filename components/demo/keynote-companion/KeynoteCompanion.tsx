import { useEffect, useRef, useState } from 'react';
import { Modality } from '@google/genai';
import BasicFace from '../basic-face/BasicFace';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { createSystemInstructions } from '@/lib/prompts';
import { useAgent, useUser } from '@/lib/state';

export default function KeynoteCompanion() {
  const { client, connected, setConfig } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const user = useUser();
  const { current } = useAgent();
  const [displayedImage, setDisplayedImage] = useState<{ url: string, caption: string } | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev.slice(-20), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Обробка tool calls від моделі
  useEffect(() => {
    if (!client || !connected) {
      addLog('⛔ Client or connection missing');
      return;
    }

    addLog('✅ Client connected, setting up handlers');

    const handleToolCall = (toolCall: any) => {
      addLog('📥 RAW EVENT: ' + JSON.stringify(toolCall, null, 2));

      // Пробуємо різні формати
      const calls = (
        toolCall.functionCalls ||
        toolCall.toolCalls ||
        (toolCall.modelTurn?.parts || []).map((part: any) => part.functionCall).filter(Boolean) ||
        (toolCall.serverContent?.modelTurn?.parts || []).map((part: any) => part.functionCall).filter(Boolean) ||
        []
      ).filter(Boolean);

      addLog(`🔍 Found ${calls.length} function calls`);

      if (calls.length > 0) {
        calls.forEach(async (fc: any) => {
          addLog(`🎯 FUNCTION CALL: ${fc.name}`);
          addLog(`📝 ARGS: ${JSON.stringify(fc.args)}`);
          
          // === ЧИТАННЯ GOOGLE ТАБЛИЦІ ===
          if (fc.name === 'read_google_sheet') {
            const { spreadsheetId, range } = fc.args;
            addLog(`📊 Reading: ${spreadsheetId} ${range}`);

            try {
              const apiUrl = 'https://mc-pbot-google-sheets.vercel.app/api';
              addLog(`🌐 Calling API: ${apiUrl}`);

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spreadsheetId, range })
              });

              addLog(`📡 Response status: ${response.status}`);

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const result = await response.json();
              addLog(`✅ Data received: ${JSON.stringify(result.data)}`);

              if (result.success) {
                client.send({
                  tool_response: {
                    function_responses: [{
                      name: 'read_google_sheet',
                      id: fc.id || 'sheet-id',
                      response: {
                        success: true,
                        values: result.data
                      }
                    }]
                  }
                });
                addLog('✉️ Sent response to model');
              } else {
                throw new Error(result.error || 'Failed');
              }
            } catch (error) {
              addLog(`❌ ERROR: ${error}`);
              client.send({
                tool_response: {
                  function_responses: [{
                    name: 'read_google_sheet',
                    id: fc.id || 'sheet-id',
                    response: {
                      success: false,
                      error: error instanceof Error ? error.message : 'Error'
                    }
                  }]
                }
              });
            }
          } 
          // === ПОКАЗ КАРТИНКИ ===
          else if (fc.name === 'show_image') {
            const { imageUrl, caption } = fc.args;
            addLog(`📸 SHOWING IMAGE: ${imageUrl}`);
            
            setDisplayedImage({ url: imageUrl, caption: caption || '' });

            client.send({
              tool_response: {
                function_responses: [{
                  name: 'show_image',
                  id: fc.id || 'img-id',
                  response: { success: true }
                }]
              }
            });
            addLog('✅ Image displayed');
          } else {
            addLog(`⚠️ Unknown function: ${fc.name}`);
          }
        });
      } else {
        addLog('⚠️ No function calls found in event');
      }
    };

    // Підписуємось на ВСІ можливі події
    const events = ['toolcall', 'toolCall', 'tool_call', 'content', 'message', 
                    'turncomplete', 'turn_complete', 'serverContent'];
    
    events.forEach(event => {
      client.on(event, (data: any) => {
        addLog(`📣 Event: ${event}`);
        handleToolCall(data);
      });
    });

    addLog('🔔 Subscribed to all events');

    return () => {
      events.forEach(event => client.off(event, handleToolCall));
      addLog('🔕 Unsubscribed');
    };
  }, [client, connected]);

  // Конфігурація Live API
  useEffect(() => {
    if (!current.tools) {
      addLog('⚠️ No tools defined in agent config!');
      return;
    }

    const tools = [{
      function_declarations: current.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }];

    addLog(`🔧 Setting config with ${current.tools.length} tools`);
    addLog(`📋 Tools: ${current.tools.map(t => t.name).join(', ')}`);

    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: current.voice },
        },
      },
      systemInstruction: {
        parts: [{ text: createSystemInstructions(current, user) }],
      },
      tools: tools,
    });

    addLog('✅ Config set');
  }, [setConfig, user, current]);

  return (
    <>
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>

      {/* DEBUG CONSOLE */}
      <div style={{
        position: 'fixed',
        bottom: 10,
        left: 10,
        right: 10,
        maxHeight: '200px',
        background: 'rgba(0, 0, 0, 0.9)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '11px',
        padding: '10px',
        borderRadius: '8px',
        overflow: 'auto',
        zIndex: 10000,
        border: '1px solid #0f0'
      }}>
        <div style={{ marginBottom: '5px', color: '#ff0' }}>
          🐛 DEBUG LOG (останні 20 подій):
        </div>
        {debugLog.map((log, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>{log}</div>
        ))}
      </div>

      {/* Відображення картинки */}
      {displayedImage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            position: 'relative',
            maxWidth: '90%',
            maxHeight: '90%',
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            <button
              onClick={() => setDisplayedImage(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                background: '#ff4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
            >
              ✕
            </button>
            <img
              src={displayedImage.url}
              alt={displayedImage.caption}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                borderRadius: '12px',
                display: 'block'
              }}
            />
            {displayedImage.caption && (
              <p style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '20px',
                fontWeight: 600,
                color: '#333',
                marginBottom: 0
              }}>{displayedImage.caption}</p>
            )}
          </div>
        </div>
      )}

      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>Experimental model from Google DeepMind.</p>
        </div>
      </details>
    </>
  );
}
