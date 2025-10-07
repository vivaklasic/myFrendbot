import { useEffect, useRef } from 'react';
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
                  range: { type: 'STRING', description: 'Range like A1:Z100' },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
          ],
        },
      ],
    });
  }, [setConfig, user, current]);

  // 🔍 тест загрузки картинки по ссылке
  useEffect(() => {
    const url = 'https://example.com/test-image.png'; // 🔹 замени на свою ссылку
    const img = new Image();
    img.crossOrigin = 'anonymous'; // важно, если источник внешний
    img.onload = () => {
      const canvas = faceCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log('✅ Image drawn successfully');
      }
    };
    img.onerror = (err) => {
      console.error('❌ Image load error:', err);
    };
    img.src = url;
  }, []);

  return (
    <>
      <div className="keynote-companion relative w-full h-full">
        {/* 🔊 блок с ботом */}
        <div className="relative z-10">
          <details className="info-overlay">
            <summary className="info-button">
              <span className="icon">info</span>
            </summary>
            <div className="info-text">
              <p>
                Experimental model from Google DeepMind. Adapted for the service. Speaks many languages.
              </p>
            </div>
          </details>
        </div>

        {/* 🖼 канвас поверх бота */}
        <div className="absolute inset-0 z-40 flex justify-center items-center pointer-events-none">
          <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
          {/* 👉 если BasicFace не рисует сам, можно отладить через drawImage выше */}
        </div>
      </div>
    </>
  );
}
