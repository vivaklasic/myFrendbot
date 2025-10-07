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
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: current.voice },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: createSystemInstructions(current, user) + '\n\nIMPORTANT: When user asks about spreadsheet data, use read_google_sheet with range "trees!A1:C3". First row is headers: "Name of the tree", "Description", "Image URL". Second row contains the actual data. After reading the data, extract the Image URL from column C (third column) and use show_image to display it.',
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'read_google_sheet',
              description: 'Read data from Google Sheets. The spreadsheet has a "trees" sheet with columns A=Name, B=Description, C=Image URL. Row 1 is headers, Row 2 has data. Always use range "trees!A1:C3".',
              parameters: {
                type: 'OBJECT',
                properties: {
                  spreadsheetId: {
                    type: 'STRING',
                    description: 'The Google Sheets spreadsheet ID from the URL',
                  },
                  range: {
                    type: 'STRING',
                    description: 'Must be "trees!A1:C3" to read headers and one data row',
                  },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
            {
              name: 'show_image',
              description: 'Display an image from URL found in column C of the spreadsheet',
              parameters: {
                type: 'OBJECT',
                properties: {
                  imageUrl: {
                    type: 'STRING',
                    description: 'Complete image URL from column C (Image URL column)',
                  },
                },
                required: ['imageUrl'],
              },
            },
          ],
        },
      ],
    });
  }, [setConfig, user, current]);

  // Обробка tool calls від Gemini
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      console.log('=== TOOL CALL RECEIVED ===', toolCall);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                console.log('📊 Reading sheet:', { spreadsheetId, range });
                
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                console.log('📊 Sheet response:', data);

                if (data.success && data.data && data.data.length > 0) {
                  // Перший рядок - заголовки
                  const headers = data.data[0];
                  // Другий рядок - дані
                  const dataRow = data.data[1];
                  
                  console.log('📊 Headers:', headers);
                  console.log('📊 Data row:', dataRow);
                  
                  // Формуємо читабельну відповідь
                  const formattedResponse = `
Headers: ${headers.join(' | ')}
Data: ${dataRow.join(' | ')}

${headers[0]}: ${dataRow[0]}
${headers[1]}: ${dataRow[1]}
${headers[2]}: ${dataRow[2]}
                  `.trim();

                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: true,
                        headers: headers,
                        data: dataRow,
                        formattedData: formattedResponse,
                        imageUrl: dataRow[2], // URL з третьої колонки
                      },
                    },
                  };
                } else {
                  console.error('❌ Failed to read sheet:', data);
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: data.error || 'No data found in spreadsheet',
                      },
                    },
                  };
                }
              } catch (error: any) {
                console.error('❌ Sheet error:', error);
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: false,
                      error: `Error: ${error.message}`,
                    },
                  },
                };
              }
            }

            if (fc.name === 'show_image') {
              try {
                const { imageUrl } = fc.args;
                console.log('🖼️ Showing image:', imageUrl);
                
                if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
                  console.error('❌ Invalid URL:', imageUrl);
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: 'Invalid image URL - must start with http:// or https://',
                      },
                    },
                  };
                }
                
                setCurrentImage(imageUrl);
                console.log('✅ Image set successfully');
                
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: true,
                      message: `Image displayed: ${imageUrl}`,
                    },
                  },
                };
              } catch (error: any) {
                console.error('❌ Image error:', error);
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
        console.log('📤 Sending responses:', validResponses);
        
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
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>
      
      {/* Затемнення фону */}
      {currentImage && (
        <div
          onClick={() => setCurrentImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 999,
          }}
        />
      )}
      
      {/* Canvas з зображенням */}
      {currentImage && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '600px',
          maxHeight: '80vh',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 1000,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <button
            onClick={() => setCurrentImage(null)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.6)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            ×
          </button>
          <img 
            src={currentImage} 
            alt="Content from spreadsheet"
            onError={(e) => {
              console.error('❌ Image failed to load:', currentImage);
              e.currentTarget.style.display = 'none';
            }}
            onLoad={() => {
              console.log('✅ Image loaded successfully');
            }}
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(80vh - 40px)',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
        </div>
      )}
      
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
