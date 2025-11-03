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
