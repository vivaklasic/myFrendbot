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
      setConfig({
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: current.voice } },
        },
        systemInstruction: {
          parts: [
            {
              text: createSystemInstructions(current, user) + 
                '\n\n**MANDATORY FUNCTION CALLING PROTOCOL:**\n' +
                'When you receive spreadsheet data that contains URLs (links starting with http:// or https://), you MUST:\n' +
                '1. Identify ALL URLs in the data\n' +
                '2. For EACH image URL found, IMMEDIATELY call show_image function with that URL\n' +
                '3. ALWAYS call show_image - this is NOT optional\n' +
                '4. Call show_image BEFORE telling the user about the results\n' +
                '5. If you see any URL that looks like an image (ends with .jpg, .png, .gif, etc. or is from image hosting), call show_image\n\n' +
                'Example correct behavior:\n' +
                '- User asks about spreadsheet\n' +
                '- You call read_google_sheet\n' +
                '- You receive data with URL: "https://example.com/image.jpg"\n' +
                '- You IMMEDIATELY call show_image with imageUrl: "https://example.com/image.jpg"\n' +
                '- Then you tell user what you found\n\n' +
                'Default spreadsheet: 1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU (Range: A1:Z10)',
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
                description: 'MANDATORY: Display an image on screen. You MUST call this function whenever you find any URL in spreadsheet data. This is required, not optional. Call it immediately after reading sheet data if URLs are present.',
                parameters: {
                  type: 'OBJECT',
                  properties: { 
                    imageUrl: { 
                      type: 'STRING', 
                      description: 'Complete URL of image to display. Must start with http:// or https://. Examples: https://example.com/photo.jpg or https://i.imgur.com/abc123.png'
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
      
      setDebugLog(prev => [...prev, `🔧 Tool: ${toolCall.functionCalls?.map((f: any) => f.name).join(', ')}`]);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            console.log('📞 Processing function:', fc.name, 'with args:', fc.args);
            
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                
                console.log('📊 ========== READ_GOOGLE_SHEET CALLED ==========');
                console.log('📊 Spreadsheet ID:', spreadsheetId);
                console.log('📊 Range:', range);
                setDebugLog(prev => [...prev, `📊 Reading sheet: ${spreadsheetId.substring(0, 10)}...`]);

                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                console.log('📊 Sheet data received:', data);
                setDebugLog(prev => [...prev, `✅ Sheet read: ${data.data?.length || 0} rows`]);

                if (data.success && data.data) {
                  // Шукаємо URLs у даних
                  const foundUrls: string[] = [];
                  data.data.forEach((row: any[]) => {
                    row.forEach((cell: any) => {
                      if (typeof cell === 'string' && (cell.startsWith('http://') || cell.startsWith('https://'))) {
                        foundUrls.push(cell);
                      }
                    });
                  });

                  const formattedText = data.data.map((row: any[], i: number) => {
                    return `Row ${i + 1}: ${row.join(' | ')}`;
                  }).join('\n');

                  const responseText = formattedText + 
                    (foundUrls.length > 0 
                      ? `\n\n🔗 FOUND ${foundUrls.length} URL(s) - YOU MUST NOW CALL show_image FOR EACH:\n${foundUrls.map((url, i) => `${i+1}. ${url}`).join('\n')}\n\n⚠️ REQUIRED ACTION: Call show_image function now with the first URL!`
                      : '');

                  console.log('📊 Response with URLs:', responseText);
                  setDebugLog(prev => [...prev, `🔗 Found ${foundUrls.length} URLs`]);

                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: true,
                        data: data.data,
                        text: responseText,
                        foundUrls: foundUrls,
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
                
                setDebugLog(prev => [...prev, `🖼️ show_image: ${imageUrl || 'NO URL'}`]);
                
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
                setDebugLog(prev => [...prev, `✅ Image displayed!`]);
                
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
