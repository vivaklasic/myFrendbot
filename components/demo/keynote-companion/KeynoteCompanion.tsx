//работает, но надо починить канвас

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
  useEffect(() => {
    if (!client || !connected) {
      console.log('⚠️ Client or connection not ready:', { client: !!client, connected });
      return;
    }

    console.log('✅ Tool call handler registered');

    const handleToolCall = async (toolCall: any) => {
      console.log('\n🔔 TOOL CALL RECEIVED');
      console.log('Full toolCall object:', JSON.stringify(toolCall, null, 2));

      if (!toolCall.functionCalls?.length) return;

      const responses = await Promise.all(
        toolCall.functionCalls.map(async (fc: any, index: number) => {
          console.log(`🧩 Function Call #${index + 1}: ${fc.name}`);

          if (fc.name === 'show_image') {
            const imageUrl = fc.args?.imageUrl || fc.args?.url;
            console.log('🖼️ show_image called with URL:', imageUrl);

            if (!imageUrl || !imageUrl.startsWith('http')) {
              return {
                name: fc.name,
                id: fc.id,
                response: { result: { success: false, error: 'Invalid image URL' } },
              };
            }

            setCurrentImage(imageUrl);
            console.log('✅ Image state updated');
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
            try {
              const { spreadsheetId, range } = fc.args;
              const res = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spreadsheetId, range }),
              });
              const data = await res.json();
              return {
                name: fc.name,
                id: fc.id,
                response: {
                  result: { success: data.success, data: data.data },
                },
              };
            } catch (err: any) {
              return {
                name: fc.name,
                id: fc.id,
                response: { result: { success: false, error: err.message } },
              };
            }
          }

          return null;
        })
      );

      const validResponses = responses.filter(Boolean);
      console.log('📤 Sending tool responses:', validResponses);
      client.sendToolResponse({ functionResponses: validResponses });
    };

    client.on('toolcall', handleToolCall);
    return () => client.off('toolcall', handleToolCall);
  }, [client, connected]);

  // Лог смены изображения
  useEffect(() => {
    console.log('🖼️ IMAGE STATE CHANGED:', currentImage);
  }, [currentImage]);

  return (
    <>
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
              onLoad={() => console.log('✅ Image loaded:', currentImage)}
              onError={(e) => console.error('❌ Image failed:', currentImage, e)}
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
