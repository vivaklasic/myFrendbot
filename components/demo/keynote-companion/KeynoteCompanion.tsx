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
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // ТЕСТ: автоматично показати зображення через 3 секунди після завантаження
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('TEST: Setting test image');
      setDebugLog(prev => [...prev, 'TEST: Auto-showing image after 3s']);
      setCurrentImage('https://picsum.photos/400/300');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Set the configuration for the Live API
  useEffect(() => {
    async function setupConfig() {
      let sheetText = '';
      try {
        const res = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: '1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU',
            range: 'A1:Z10',
          }),
        });
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          sheetText = data.data
            .map((row: any[], i: number) => `Row ${i + 1}: ${row.join(' | ')}`)
            .join('\n');
        }
      } catch (err) {
        console.error('Failed to fetch sheet data', err);
      }

      setConfig({
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: current.voice } },
        },
        systemInstruction: {
          parts: [
            {
              text: createSystemInstructions(current, user) + 
                '\n\n**CRITICAL FUNCTION CALLING RULES:**\n' +
                '1. When you see an image URL in data, you MUST call show_image function - do not just talk about it\n' +
                '2. DO NOT say "I will show the image" or "calling show_image" - ACTUALLY CALL IT\n' +
                '3. DO NOT describe what you would do - DO IT by calling the function\n' +
                '4. Example of WRONG behavior: "I am calling show_image with url..."\n' +
                '5. Example of CORRECT behavior: [Actually invoke show_image tool]\n' +
                '6. After calling show_image, you can then tell the user what you displayed\n' +
                '7. ALWAYS call functions instead of describing them\n\n' +
                'Spreadsheet data:\n' + sheetText,
            },
          ],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'read_google_sheet',
                description: 'Read data from a Google Sheet. Returns the data as text and structured array.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    spreadsheetId: { 
                      type: 'STRING', 
                      description: 'Google Sheets spreadsheet ID' 
                    },
                    range: { 
                      type: 'STRING', 
                      description: 'Cell range like A1:Z10' 
                    }
                  },
                  required: ['spreadsheetId', 'range'],
                },
              },
              {
                name: 'show_image',
                description: 'Display an image on the screen. Call this function (do not just mention it) when you have an image URL to show. Returns success confirmation.',
                parameters: {
                  type: 'OBJECT',
                  properties: { 
                    imageUrl: { 
                      type: 'STRING', 
                      description: 'Full URL of the image to display (must start with http:// or https://)'
                    } 
                  },
                  required: ['imageUrl'],
                },
              },
            ],
          },
        ],
      });
    }

    setupConfig();
  }, [setConfig, user, current]);

  // Обробка tool calls від Gemini
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      console.log('🔧 Tool call received:', JSON.stringify(toolCall, null, 2));
      console.log('🔧 Function calls:', toolCall.functionCalls);
      console.log('🔧 Number of function calls:', toolCall.functionCalls?.length);
      
      setDebugLog(prev => [...prev, `Tool call: ${toolCall.functionCalls?.map((f: any) => f.name).join(', ')}`]);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            console.log('📞 Processing function:', fc.name, 'with args:', fc.args);
            
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;

                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                console.log('📊 Sheet data received:', data);

                if (data.success && data.data) {
                  const formattedText = data.data.map((row: any[], i: number) => {
                    return `Row ${i + 1}: ${row.join(' | ')}`;
                  }).join('\n');

                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: true,
                        data: data.data,
                        text: formattedText,
                        rowCount: data.data.length,
                        columnCount: data.data[0]?.length || 0,
                      },
                    },
                  };
                } else {
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: data.error || 'Failed to read spreadsheet',
                      },
                    },
                  };
                }
              } catch (error: any) {
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: false,
                      error: error.message,
                    },
                  },
                };
              }
            }

            if (fc.name === 'show_image') {
              try {
                const imageUrl = fc.args?.imageUrl || fc.args?.url;
                console.log('🖼️ ========== SHOW_IMAGE CALLED ==========');
                console.log('🖼️ Full function call object:', JSON.stringify(fc, null, 2));
                console.log('🖼️ Image URL extracted:', imageUrl);
                console.log('🖼️ Args received:', JSON.stringify(fc.args, null, 2));
                
                setDebugLog(prev => [...prev, `show_image called: ${imageUrl || 'NO URL'}`]);
                
                if (!imageUrl) {
                  console.error('❌ No imageUrl in args:', fc.args);
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: 'No image URL provided',
                      },
                    },
                  };
                }

                if (!imageUrl.startsWith('http')) {
                  console.error('❌ Invalid URL format:', imageUrl);
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: 'URL must start with http:// or https://',
                      },
                    },
                  };
                }
                
                console.log('✅ Setting image URL:', imageUrl);
                setCurrentImage(imageUrl);
                setDebugLog(prev => [...prev, `✅ Image set: ${imageUrl}`]);
                
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: true,
                      message: `Image displayed successfully: ${imageUrl}`,
                      displayedUrl: imageUrl,
                    },
                  },
                };
              } catch (error: any) {
                console.error('❌ Image display error:', error);
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: false,
                      error: error.message,
                    },
                  },
                };
              }
            }

            return null;
          })
        );

        const validResponses = responses.filter(r => r !== null);
        console.log('📤 Sending tool responses:', validResponses);

        client.sendToolResponse({
          functionResponses: validResponses,
        });
      }
    };

    client.on('toolcall', handleToolCall);

    return () => {
      client.off('toolcall', handleToolCall);
    };
  }, [client, connected]);

  return (
    <>
      {/* Debug Log - внизу екрану */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        right: '10px',
        backgroundColor: 'rgba(0,0,0,0.9)',
        color: 'lime',
        padding: '8px',
        borderRadius: '8px',
        maxHeight: '150px',
        overflow: 'auto',
        fontSize: '11px',
        fontFamily: 'monospace',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        {debugLog.slice(-8).map((log, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>{log}</div>
        ))}
      </div>

      {/* Зображення ПОВЕРХ усього */}
      {currentImage && (
        <>
          <div
            onClick={() => setCurrentImage(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              zIndex: 9999
            }}
          />
          
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw',
            maxWidth: '600px',
            backgroundColor: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            zIndex: 10000,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '20px'
          }}>
            <button
              onClick={() => setCurrentImage(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'black',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '24px',
                fontWeight: 'bold',
                zIndex: 10001
              }}
            >
              ×
            </button>
            <img 
              src={currentImage} 
              alt="Content"
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '80vh',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </div>
        </>
      )}
      
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>
      
      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>
            Experimental model from Google DeepMind. Adapted for the service. Speaks many languages. On iOS, disable AVR.
          </p>
        </div>
      </details>
    </>
  );
}
