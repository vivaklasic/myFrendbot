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
  const [displayedImage, setDisplayedImage] = useState<{ url: string, caption: string } | null>(null);

  // Обработка tool calls от модели
  useEffect(() => {
    if (!client || !connected) {
      console.log('⛔ Client or connection missing:', { client, connected });
      return;
    }

    const handleToolCall = (toolCall: any) => {
      console.log('✅ Tool call received:', JSON.stringify(toolCall, null, 2));

      // Проверяем все возможные форматы данных
      const calls = (
        toolCall.functionCalls ||
        toolCall.toolCalls ||
        toolCall.modelTurn?.parts?.map((part: any) => part.functionCall) ||
        []
      ).filter((fc: any) => fc); // Фильтруем undefined

      if (calls.length > 0) {
        calls.forEach((fc: any) => {
          console.log('🔍 Processing function call:', fc);
          if (fc.name === 'show_image') {
            const { imageUrl, caption } = fc.args;
            console.log('📸 Showing image:', { imageUrl, caption });
            setDisplayedImage({ url: imageUrl, caption: caption || '' });

            client.send({
              tool_response: {
                function_responses: [{
                  name: 'show_image',
                  id: fc.id || 'default-id',
                  response: { success: true }
                }]
              }
            });
          } else {
            console.log('⚠️ Unknown function call:', fc.name);
          }
        });
      } else {
        console.log('⚠️ No function calls found in:', toolCall);

        // Проверяем текст в modelTurn.parts на упоминание врача Юрія
        const parts = toolCall.modelTurn?.parts || [];
        parts.forEach((part: any) => {
          if (part.text && /Dr\. Yuriy|кардіолог Юрій/i.test(part.text)) {
            console.log('🩺 Detected Dr. Yuriy in text, triggering show_image');
            setDisplayedImage({
              url: 'https://i.ibb.co/GfdcvnnD/bench.jpg',
              caption: 'Найкращий лікар — кардіолог Юрій'
            });
            client.send({
              tool_response: {
                function_responses: [{
                  name: 'show_image',
                  id: 'text-based-id',
                  response: { success: true }
                }]
              }
            });
          }
        });
      }
    };

    console.log('🔔 Subscribing to events');
    client.on('toolcall', handleToolCall);
    client.on('toolCall', handleToolCall);
    client.on('tool_call', handleToolCall);
    client.on('content', handleToolCall);
    client.on('message', (data: any) => {
      console.log('📩 Raw message:', JSON.stringify(data, null, 2));
      handleToolCall(data);
    });

    return () => {
      console.log('🔔 Unsubscribing from events');
      client.off('toolcall', handleToolCall);
      client.off('toolCall', handleToolCall);
      client.off('tool_call', handleToolCall);
      client.off('content', handleToolCall);
      client.off('message', handleToolCall);
    };
  }, [client, connected]);

  // Установка конфигурации для Live API
  useEffect(() => {
    const tools = current.tools ? [{
      function_declarations: current.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }] : undefined;

    console.log('🔧 Setting config with tools:', JSON.stringify(tools, null, 2));

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
            text: createSystemInstructions(current, user),
          },
        ],
      },
      tools: tools,
    });
  }, [setConfig, user, current]);

  // Отладка рендеринга
  useEffect(() => {
    console.log('🖼️ displayedImage updated:', displayedImage);
  }, [displayedImage]);

  return (
    <>
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>

      {/* Кнопка для РУЧНОГО ТЕСТА */}
      <button
        onClick={() => setDisplayedImage({
          url: 'https://i.ibb.co/GfdcvnnD/bench.jpg',
          caption: 'Найкращий лікар — кардіолог Юрій'
        })}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 20px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: 600
        }}
      >
        ТЕСТ
      </button>

      {/* Відображення картинки */}
      {displayedImage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            position: 'relative',
            maxWidth: '90%',
            maxHeight: '90%',
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            <button
              onClick={() => setDisplayedImage(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                background: '#ff4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
            >
              ✕
            </button>
            <img
              src={displayedImage.url}
              alt={displayedImage.caption}
              onError={(e) => console.error('Image load error:', e, 'URL:', displayedImage.url)}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                borderRadius: '12px',
                display: 'block'
              }}
            />
            {displayedImage.caption && (
              <p style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '20px',
                fontWeight: 600,
                color: '#333',
                marginBottom: 0
              }}>{displayedImage.caption}</p>
            )}
          </div>
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
}
