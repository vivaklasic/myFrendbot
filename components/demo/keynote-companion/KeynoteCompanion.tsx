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

      const systemInstruction =
  createSystemInstructions(current, user) +
  '\n\n**IMPORTANT INSTRUCTIONS FOR IMAGE DISPLAY:**\n' +
  '- Use the show_image function to display images by URL.\n' +
  '- Always use full URLs starting with http:// or https://.\n' +
  '- When the user asks about AI ethics (for example, "What is AI ethics?" or "Tell me about the ethics of artificial intelligence"), call show_image with:\n' +
  '  {\n' +
  '    "imageUrl": "https://i.ibb.co/TDnPTYzR/gptacp.jpg",\n' +
  '    "caption": "AI Ethics — the principles that protect people and their data."\n' +
  '  }\n' +
  '- When the user asks about the website (for example, "What is aifake.pro?" or "Tell me about the site"), call show_image with:\n' +
  '  {\n' +
  '    "imageUrl": "https://i.ibb.co/3y8MDHPK/agi.jpg",\n' +
  '    "caption": "The aifake.pro portal helps people recognize AI-generated fake content."\n' +
  '  }\n';

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
    {/* клик вне картинки = закрыть */}
    <div
      onClick={() => setCurrentImage(null)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
      }}
    />

    {/* сама картинка */}
    <img
      src={currentImage}
      alt="Full"
      onClick={(e) => e.stopPropagation()} // чтобы клик по картинке не закрывал
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: '95vw',
        maxHeight: '95vh',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '16px',
        boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        zIndex: 9999,
      }}
    />

    {/* кнопка × */}
    <button
      onClick={() => setCurrentImage(null)}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        fontSize: '30px',
        cursor: 'pointer',
        zIndex: 10000,
        backdropFilter: 'blur(10px)',
      }}
    >
      ×
    </button>
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
    </>
  );
}
