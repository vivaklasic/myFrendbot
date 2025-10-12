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
                '\n\n**IMPORTANT INSTRUCTIONS FOR IMAGE DISPLAY:**\n' +
                '- You MUST use the show_image function to display images\n' +
                '- When you find an image URL in the spreadsheet, immediately call show_image with that URL\n' +
                '- The show_image function is available and working\n' +
                '- Always use complete URLs starting with http:// or https://\n\n' +
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
                description: 'CRITICAL TOOL: Display an image on screen. You MUST call this function whenever you find an image URL in spreadsheet data. This function works and is available to you. Example: show_image({imageUrl: "https://example.com/photo.jpg"})',
                parameters: {
                  type: 'OBJECT',
                  properties: { 
                    imageUrl: { 
                      type: 'STRING', 
                      description: 'Complete image URL starting with http:// or https:// (e.g., https://example.com/image.jpg)'
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
    if (!client || !connected) {
      console.log('⚠️ Client or connection not ready:', { client: !!client, connected });
      return;
    }

    console.log('✅ Tool call handler registered');

    const handleToolCall = async (toolCall: any) => {
      console.log('\n═══════════════════════════════════════');
      console.log('🔔 TOOL CALL RECEIVED');
      console.log('═══════════════════════════════════════');
      console.log('Full toolCall object:', JSON.stringify(toolCall, null, 2));
      
      const showImageCall = toolCall.functionCalls?.find((fc: any) => fc.name === 'show_image');
      if (showImageCall) {
        console.log('\n🖼️  SHOW_IMAGE DETECTED!');
        console.log('Args:', JSON.stringify(showImageCall.args, null, 2));
      }

      if (toolCall.functionCalls) {
        console.log(`\n📋 Processing ${toolCall.functionCalls.length} function call(s)\n`);
        
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any, index: number) => {
            console.log(`┌─ Function Call #${index + 1} ─────────────────`);
            console.log('│ Name:', fc.name);
            console.log('│ ID:', fc.id);
            console.log('│ Args:', JSON.stringify(fc.args, null, 2));
            
            if (fc.name === 'read_google_sheet') {
              console.log('│ Processing: read_google_sheet');
              try {
                const { spreadsheetId, range } = fc.args;

                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                console.log('│ ✅ Sheet data received:', data.success ? 'Success' : 'Failed');
                console.log('│ Rows:', data.data?.length || 0);

                if (data.success && data.data) {
                  const formattedText = data.data.map((row: any[], i: number) => {
                    return `Row ${i + 1}: ${row.join(' | ')}`;
                  }).join('\n');

                  console.log('└─────────────────────────────────────\n');

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
                  console.log('│ ❌ Failed to read sheet');
                  console.log('└─────────────────────────────────────\n');
                  
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
                console.log('│ ❌ Error:', error.message);
                console.log('└─────────────────────────────────────\n');
                
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
              console.log('│ Processing: show_image');
              try {
                const imageUrl = fc.args?.imageUrl || fc.args?.url;
                console.log('│ Image URL extracted:', imageUrl);
                console.log('│ URL type:', typeof imageUrl);
                console.log('│ Full args structure:', JSON.stringify(fc.args));
                
                if (!imageUrl) {
                  console.log('│ ❌ No imageUrl found in args!');
                  console.log('└─────────────────────────────────────\n');
                  
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
                  console.log('│ ❌ Invalid URL format (must start with http)');
                  console.log('└─────────────────────────────────────\n');
                  
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
                
                console.log('│ ✅ Setting image URL in state');
                console.log('│ URL:', imageUrl);
                setCurrentImage(imageUrl);
                console.log('│ ✅ State updated!');
                console.log('└─────────────────────────────────────\n');
                
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
                console.log('│ ❌ Exception:', error.message);
                console.log('│ Stack:', error.stack);
                console.log('└─────────────────────────────────────\n');
                
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

            console.log('│ ⚠️ Unknown function:', fc.name);
            console.log('└─────────────────────────────────────\n');
            return null;
          })
        );

        const validResponses = responses.filter(r => r !== null);
        console.log('\n📤 Sending tool responses back to Gemini');
        console.log('Response count:', validResponses.length);
        console.log('Responses:', JSON.stringify(validResponses, null, 2));
        console.log('═══════════════════════════════════════\n');

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

  // Log when image state changes
  useEffect(() => {
    console.log('🖼️  IMAGE STATE CHANGED:', currentImage);
  }, [currentImage]);

  return (
    <>
      {/* Зображення ПОВЕРХ усього */}
      {currentImage && (
        <>
          <div
            onClick={() => {
              console.log('🖼️  Closing image modal (backdrop clicked)');
              setCurrentImage(null);
            }}
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
              onClick={() => {
                console.log('🖼️  Closing image modal (X button clicked)');
                setCurrentImage(null);
              }}
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
              onLoad={() => console.log('🖼️  Image loaded successfully:', currentImage)}
              onError={(e) => console.error('🖼️  Image failed to load:', currentImage, e)}
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
