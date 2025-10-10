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
  const [status, setStatus] = useState<string>('🟡 Waiting for connection...');

  // 🧩 Тест — показать картинку через 3 секунды
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('🧪 TEST: Showing local test image');
      setCurrentImage('https://picsum.photos/400/300');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // ⚙️ Конфигурация Live API
  useEffect(() => {
    async function setupConfig() {
      if (!connected || !client) {
        setStatus('⚠️ Not connected to Live API');
        return;
      }

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
        console.error('❌ Failed to fetch sheet data', err);
      }

      try {
        await setConfig({
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: current.voice } },
          },
          systemInstruction: {
            parts: [
              {
                text:
                  createSystemInstructions(current, user) +
                  '\n\n**IMPORTANT:**\n' +
                  '- Use the show_image function to display images.\n' +
                  '- Always call show_image(imageUrl) when image is found.\n' +
                  '- Only use full URLs starting with http/https.\n\n' +
                  'Spreadsheet data:\n' +
                  sheetText,
              },
            ],
          },
          tools: [
            {
              name: 'read_google_sheet',
              description:
                'Reads data from a Google Sheet and returns structured output.',
              parameters: {
                type: 'object',
                properties: {
                  spreadsheetId: { type: 'string' },
                  range: { type: 'string' },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
            {
              name: 'show_image',
              description: 'Display an image in the UI.',
              parameters: {
                type: 'object',
                properties: {
                  imageUrl: { type: 'string' },
                },
                required: ['imageUrl'],
              },
            },
          ],
        });

        setStatus('✅ Config applied successfully');
      } catch (err) {
        console.error('❌ Error setting Live API config', err);
        setStatus('❌ Config failed');
      }
    }

    setupConfig();
  }, [setConfig, connected, client, current, user]);

  // 🧰 Обработка вызовов инструментов (tools)
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      console.log('🧩 Tool call received:', toolCall);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            console.log(`⚙️ Processing function: ${fc.name}`, fc.args);

            if (fc.name === 'show_image') {
              const imageUrl = fc.args?.imageUrl || fc.args?.url;
              if (!imageUrl) {
                console.error('❌ show_image: no imageUrl provided');
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: { success: false, error: 'Missing imageUrl' },
                  },
                };
              }

              console.log('🖼️ show_image →', imageUrl);
              setCurrentImage(imageUrl);

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
            }

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

                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: true,
                      data: data.data,
                      text: data.data.map((r: any[], i: number) => `Row ${i + 1}: ${r.join(' | ')}`).join('\n'),
                    },
                  },
                };
              } catch (err: any) {
                console.error('❌ Sheet read failed', err);
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: { success: false, error: err.message },
                  },
                };
              }
            }

            return null;
          })
        );

        const validResponses = responses.filter(Boolean);
        client.sendToolResponse({ functionResponses: validResponses });
      }
    };

    client.on('toolcall', handleToolCall);
    return () => client.off('toolcall', handleToolCall);
  }, [client, connected]);

  // 🧱 UI
  return (
    <>
      {/* 🖼️ Оверлей изображения */}
      {currentImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setCurrentImage(null)}
        >
          <div
            style={{
              position: 'relative',
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setCurrentImage(null)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <img
              src={currentImage}
              alt="Displayed content"
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      )}

      {/* 🧠 Основной блок */}
      <div
        className="keynote-companion"
        style={{
          position: 'relative',
          zIndex: currentImage ? 1 : 100,
        }}
      >
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>

      {/* ℹ️ Информация + статус */}
      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>{status}</p>
          <p>
            Experimental model (Google DeepMind). Speaks multiple languages.
            Disable AVR on iOS if issues occur.
          </p>
        </div>
      </details>
    </>
  );
}
