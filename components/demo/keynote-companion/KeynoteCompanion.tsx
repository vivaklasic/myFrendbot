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

  // Настройка конфига для Live API (только показ изображений)
  useEffect(() => {
    async function setupConfig() {
      console.log('🚀 INITIALIZATION: Setting up config...');

      const systemInstruction = createSystemInstructions(current, user)

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

  // Обработка вызова функции show_image
  useEffect(() => {
    if (!client || !connected) {
      console.log('⚠️ Client or connection not ready:', { client: !!client, connected });
      return;
    }

    console.log('✅ Tool call handler registered (images only)');

    const handleToolCall = async (toolCall: any) => {
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

          return null;
        })
      );

      const validResponses = responses.filter(Boolean);
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
      {/* Модальное окно с изображением */}
      {currentImage && (
  <>
    {/* фон — клик = закрыть */}
    <div
      onClick={() => setCurrentImage(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
    />

    {/* КОНТЕЙНЕР: картинка + крестик */}
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: '95vw',
        maxHeight: '95vh',
        zIndex: 9999,
      }}
    >
      {/* сама картинка */}
      <img
        src={currentImage}
        alt="full"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '95vw',
          maxHeight: '95vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: '16px',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        }}
      />

      {/* КРЕСТИК ПРИЛИП К КАРТИНКЕ */}
      <button
        onClick={() => setCurrentImage(null)}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '44px',
          height: '44px',
          fontSize: '28px',
          fontWeight: 'bold',
          cursor: 'pointer',
          zIndex: 10001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)',
        }}
      >
        ×
      </button>
    </div>
  </>
)}

      {/* Canvas под модалкой */}
      <div
        className="keynote-companion"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
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
