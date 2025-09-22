import cn from 'classnames';
import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { useUI } from '@/lib/state';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const resumeAudioContext = () => {
    if (audioRecorder && audioRecorder.audioContext.state === 'suspended') {
      audioRecorder.audioContext.resume();
    }
  };

  const { showAgentEdit, showUserConfig } = useUI();
  const { client, connected, connect, disconnect } = useLiveAPIContext();
  
  const handleConnectClick = () => {
    resumeAudioContext(); 
    connect();           
  };

  const handleMuteClick = () => {
    resumeAudioContext(); 
    setMuted(!muted);    
  };

  // Stop the current agent if the user is editing the agent or user config
  useEffect(() => {
    if (showAgentEdit || showUserConfig) {
      if (connected) disconnect();
    }
  }, [showUserConfig, showAgentEdit, connected, disconnect]);

  //useEffect(() => {
    //if (!connected && connectButtonRef.current) {
      //connectButtonRef.current.focus();
   // }
 // }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client, muted, audioRecorder]);

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav', { disabled: !connected })}>
        {/* === ИЗМЕНЕНИЕ 3.1: Используем новый обработчик === */}
        <button
          className={cn('action-button mic-button')}
          onClick={handleMuteClick}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>
        {children}
      </nav>

      <div className={cn('connection-container', { connected })}>
        <div className="connection-button-container">
          {/* === ИЗМЕНЕНИЕ 3.2: Используем новый обработчик === */}
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected })}
            onClick={connected ? disconnect : handleConnectClick}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
    </section>
  );
}

export default memo(ControlTray);
