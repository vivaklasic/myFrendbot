import { useEffect, useRef, useState } from 'react';
import { Modality } from '@google/genai';
import BasicFace from '../basic-face/BasicFace';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { createSystemInstructions } from '@/lib/prompts';
import { useAgent, useUser } from '@/lib/state';

export default function KeynoteCompanion() {
  const { client, connected, setConfig } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const user = useUser();
  const { current } = useAgent();

  // Конфіг для голосового API
  useEffect(() => {
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
      tools: [
        {
          functionDeclarations: [
            {
              name: 'read_google_sheet',
              description: 'Read data from Google Sheets spreadsheet.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  spreadsheetId: { type: 'STRING', description: 'Spreadsheet ID' },
                  range: { type: 'STRING', description: 'Range, e.g. "A1:Z10"' },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
            {
              name: 'show_image',
              description: 'Show or hide canvas image.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  visible: { type: 'BOOLEAN', description: 'Whether to show the canvas' },
                },
                required: ['visible'],
              },
            },
          ],
        },
      ],
    });
  }, [setConfig, user, current]);

  // Обробка викликів інструментів
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });
                const data = await response.json();
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: data.success
                      ? { success: true, data: data.data, rowCount: data.data.length }
                      : { success: false, error: data.error || 'Failed to read spreadsheet' },
                  },
                };
              } catch (error: any) {
                return {
                  name: fc.name,
                  id: fc.id,
                  response: { result: { success: false, error: error.message } },
                };
              }
            }

            // 👇 бот керує показом зображення
            if (fc.name === 'show_image') {
              const { visible } = fc.args;
              setShowCanvas(!!visible);
              return {
                name: fc.name,
                id: fc.id,
                response: { result: { success: true } },
              };
            }

            return null;
          })
        );
        client.sendToolResponse({ functionResponses: responses.filter(Boolean) });
      }
    };

    client.on('toolcall', handleToolCall);
    return () => client.off('toolcall', handleToolCall);
  }, [client, connected]);

 return (
  <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden">
    {/* 🔊 Блок з ботом — завжди присутній */}
    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
      <details className="info-overlay">
        <summary className="info-button cursor-pointer">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>
            Experimental model from Google DeepMind. Adapted for the service. Speaks many languages. On iOS, disable AVR.
          </p>
        </div>
      </details>

      {/* 👇 якщо у тебе є інший компонент бота (наприклад VoiceAgent або Avatar), додай його сюди */}
      <div id="bot-container" className="w-full flex items-center justify-center mt-4">
        {/* Твій голосовий бот */}
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>
    </div>

    {/* 🖼 Canvas поверх, зʼявляється тільки коли showCanvas = true */}
    {showCanvas && (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative bg-white rounded-2xl shadow-xl p-4">
          <button
            onClick={() => setShowCanvas(false)}
            className="absolute top-2 right-2 bg-red-600 text-white text-sm px-2 py-1 rounded-md hover:bg-red-700"
          >
            ✕ Закрити
          </button>

          {/* Canvas або візуалізація */}
          <canvas ref={faceCanvasRef} width={400} height={300} className="rounded-xl shadow-md" />
        </div>
      </div>
    )}
  </div>
);

}
