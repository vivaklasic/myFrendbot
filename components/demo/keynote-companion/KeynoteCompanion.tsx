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

  // Обробка tool calls від моделі
  useEffect(() => {
    if (!client || !connected) {
      console.log('⛔ Client or connection missing');
      return;
    }

    const handleToolCall = (toolCall: any) => {
      console.log('✅ Tool call received:', JSON.stringify(toolCall, null, 2));

      const calls = (
        toolCall.functionCalls ||
        toolCall.toolCalls ||
        toolCall.modelTurn?.parts?.map((part: any) => part.functionCall) ||
        []
      ).filter((fc: any) => fc);

      if (calls.length > 0) {
        calls.forEach(async (fc: any) => {
          console.log('🔍 Processing:', fc.name);
          
          // === ЧИТАННЯ GOOGLE ТАБЛИЦІ ===
          if (fc.name === 'read_google_sheet') {
            const { spreadsheetId, range } = fc.args;
            console.log('📊 Reading sheet:', { spreadsheetId, range });

            try {
              const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spreadsheetId, range })
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const result = await response.json();
              console.log('✅ Data from sheet:', result.data);

              if (result.success) {
                // Повертаємо дані моделі
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
              } else {
                throw new Error(result.error || 'Failed to read');
              }
            } catch (error) {
              console.error('❌ Error:', error);
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
            console.log('📸 Showing image:', imageUrl);
            
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
          }
        });
      }
    };

    console.log('🔔 Subscribing to events');
    client.on('toolcall', handleToolCall);
    client.on('toolCall', handleToolCall);
    client.on('tool_call', handleToolCall);
    client.on('content', handleToolCall);
    client.on('message', handleToolCall);

    return () => {
      console.log('🔔 Unsubscribing');
      client.off('toolcall', handleToolCall);
      client.off('toolCall', handleToolCall);
      client.off('tool_call', handleToolCall);
      client.off('content', handleToolCall);
      client.off('message', handleToolCall);
    };
  }, [client, connected]);

  // Конфігурація Live API
  useEffect(() => {
    const tools = current.tools ? [{
      function_declarations: current.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }] : undefined;

    console.log('🔧 Config with tools:', JSON.stringify(tools, null, 2));

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
  }, [setConfig, user, current]);

  return (
    <>
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
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
