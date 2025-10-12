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
  const [canvasReady, setCanvasReady] = useState(false);

  // Инициализация Canvas
  useEffect(() => {
    if (faceCanvasRef.current) {
      console.log('🟢 Canvas инициализирован:', faceCanvasRef.current);
      setCanvasReady(true);
    } else {
      console.warn('⚠️ Canvas ref пока пустой!');
    }
  }, [faceCanvasRef.current]);

  // Настройка конфига для Live API
  useEffect(() => {
    async function setupConfig() {
      // ... (Ваш код для настройки конфига остается без изменений)
      console.log('\n🚀 INITIALIZATION: Setting up config...');
      console.log('═══════════════════════════════════════');

      let sheetText = '';
      try {
        console.log('📊 Fetching initial sheet data...');
        const res = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: '1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU',
            range: 'A1:Z10',
          }),
        });

        console.log('📥 Response status:', res.status);
        const data = await res.json();

        if (data.success && data.data.length > 0) {
          sheetText = data.data
            .map((row: any[], i: number) => `Row ${i + 1}: ${row.join(' | ')}`)
            .join('\n');
          console.log('✅ Sheet data loaded successfully!');
        } else {
          console.log('⚠️ No data or failed:', data);
        }
      } catch (err) {
        console.error('❌ Failed to fetch sheet data:', err);
      }

      const systemInstruction =
        createSystemInstructions(current, user) +
        '\n\n**IMPORTANT INSTRUCTIONS FOR IMAGE DISPLAY:**\n' +
        '- You MUST use the show_image function to display images\n' +
        '- When you find an image URL in the spreadsheet, immediately call show_image with that URL\n' +
        '- The show_image function is available and working\n' +
        '- Always use complete URLs starting with http:// or https://\n\n' +
        'Spreadsheet data:\n' + sheetText;

      setConfig({
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: current.voice } },
        },
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'read_google_sheet',
                description: 'Read data from Google Sheet.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    spreadsheetId: { type: 'STRING' },
                    range: { type: 'STRING' },
                  },
                  required: ['spreadsheetId', 'range'],
                },
              },
              {
                name: 'show_image',
                description: 'Display image on screen (modal overlay).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    imageUrl: { type: 'STRING' },
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

  // Обработка tool calls
// Обработка tool calls
useEffect(() => {
  if (!client || !connected) {
    console.log('⚠️ Client or connection not ready:', { client: !!client, connected });
    return;
  }

  console.log('✅ Tool call handler registered');

  const handleToolCall = async (toolCall: any) => {
    // Просто для информации в консоли, на случай если понадобится
    console.log('--- Получен toolCall от модели ---', JSON.stringify(toolCall, null, 2));

    if (!toolCall.functionCalls?.length) return;

    const responses = await Promise.all(
      toolCall.functionCalls.map(async (fc: any, index: number) => {
        console.log(`🧩 Обработка вызова #${index + 1}: ${fc.name}`);

        if (fc.name === 'show_image') {
          const imageUrl = fc.args?.imageUrl || fc.args?.url;
          
          // ========================== ВОТ ГЛАВНЫЙ ТЕСТ ==========================
          alert(`!!! БОТ ВЫЗВАЛ ФУНКЦИЮ show_image !!!\n\nURL, который он прислал:\n${imageUrl}`);
          // ====================================================================

          if (!imageUrl || !imageUrl.startsWith('http')) {
            console.error('❌ ОШИБКА: Неверный URL от бота.');
            // ... (остальной код обработки ошибки)
            return {
              name: fc.name,
              id: fc.id,
              response: { result: { success: false, error: 'Invalid image URL' } },
            };
          }

          setCurrentImage(imageUrl);
          return {
            name: fc.name,
            id: fc.id,
            response: {
              result: {
                success: true,
                message: `Image displayed successfully: ${imageUrl}`,
              },
            },
          };
        }

        if (fc.name === 'read_google_sheet') {
          // ... (этот блок остается без изменений)
          try {
            const { spreadsheetId, range } = fc.args;
            const res = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId, range }),
            });
            const data = await res.json();
            return { name: fc.name, id: fc.id, response: { result: { success: data.success, data: data.data } } };
          } catch (err: any) {
            return { name: fc.name, id: fc.id, response: { result: { success: false, error: err.message } } };
          }
        }

        return null;
      })
    );

    const validResponses = responses.filter(Boolean);
    console.log('📤 Отправка ответов на tool responses:', validResponses);
    client.sendToolResponse({ functionResponses: validResponses });
  };

  client.on('toolcall', handleToolCall);
  return () => client.off('toolcall', handleToolCall);
}, [client, connected]);
  // Лог смены изображения
  useEffect(() => {
    // Этот лог поможет убедиться, что состояние действительно меняется
    if (currentImage) {
        console.log('🖼️✅ Стейт currentImage успешно обновлен:', currentImage);
    } else {
        console.log('🖼️❌ Стейт currentImage сброшен на null.');
    }
  }, [currentImage]);

  return (
    <>
      {/* ======================= DEBUG BUTTON START ======================= */}
      <button
        onClick={() => {
          const testUrl = 'https://www.gstatic.com/devrel-devsite/prod/v956e6c1437146ce29323f4c243e6284f1076f5556247c20d7d3d231cc425e791/gemini/images/use_cases/gemini_search_lab_desktop.jpg';
          console.log('--- КНОПКА ТЕСТА: Принудительно вызываю setCurrentImage с URL:', testUrl);
          setCurrentImage(testUrl);
        }}
        style={{
          position: 'fixed',
          top: '15px',
          left: '15px',
          zIndex: 10001, // Высший приоритет, чтобы быть поверх всего
          padding: '12px 18px',
          background: 'red',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
        }}
      >
        ТЕСТ ПОКАЗА КАРТИНКИ
      </button>
      {/* ======================== DEBUG BUTTON END ======================== */}


      {/* Модалка с изображением поверх всего */}
      {currentImage && (
        <>
          <div
            onClick={() => setCurrentImage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
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
                width: '36px',
                height: '36px',
                fontSize: '22px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <img
              src={currentImage}
              alt="Generated"
              onLoad={() => console.log('✅ IMG TAG: Картинка успешно загружена:', currentImage)}
              onError={(e) => console.error('❌ IMG TAG: Ошибка загрузки картинки:', currentImage, e)}
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          </div>
        </>
      )}

      {/* Канвас всегда под модалкой */}
      <div
        className="keynote-companion"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <BasicFace
          canvasRef={faceCanvasRef!}
          color={current.bodyColor}
        />
      </div>

      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>
            Experimental model from Google DeepMind. Adapted for the service.
            Speaks many languages. On iOS, disable AVR.
          </p>
        </div>
      </details>
    </>
  );
}
