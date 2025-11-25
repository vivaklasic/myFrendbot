/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { audioContext } from './utils';
import AudioRecordingWorklet from './worklets/audio-processing';
import VolMeterWorket from './worklets/vol-meter';
import { createWorketFromSrc } from './audioworklet-registry';
import EventEmitter from 'eventemitter3';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;
  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  /**
   * Отримати список всіх доступних аудіовходів
   * ВАЖЛИВО: Викликати ПІСЛЯ отримання дозволу на мікрофон
   */
  async getAudioInputs(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(device => device.kind === 'audioinput');
    
    console.log('📱 Доступні аудіовходи:', inputs.map(d => ({
      id: d.deviceId,
      label: d.label,
      groupId: d.groupId
    })));
    
    return inputs;
  }

  /**
   * Основний метод запуску запису
   * @param deviceId - ID пристрою (необов'язково). Якщо не вказано, використовується дефолтний
   */
 async start(deviceId?: string) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // 1. ВИЗНАЧЕННЯ iOS / Safari
        // (Перевірка userAgent трохи брудна, але для аудіо-хаків надійна)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        // 2. ВИПРАВЛЕННЯ CONSTRAINTS
        // На iOS вимикаємо обробку, щоб отримати "сирий" потік. 
        // Це дозволяє уникнути конфлікту Audio Session.
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: !isIOS, 
          noiseSuppression: !isIOS,
          autoGainControl: !isIOS,
          // Можна спробувати явно попросити 16k, хоча iOS часто ігнорує це і дає 48k
          // sampleRate: 16000 
        };

        // Якщо передано deviceId - використовуємо його
        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId };
          console.log('🎯 Використовуємо конкретний пристрій:', deviceId);
        } else {
          console.log('🎯 Використовуємо пристрій за замовчуванням (iOS Mode:', isIOS, ')');
        }

        // Отримуємо MediaStream
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints 
        });

        const track = this.stream.getAudioTracks()[0];
        const settings = track.getSettings();
        console.log('✅ Активовано:', {
          label: track.label,
          deviceId: settings.deviceId,
          sampleRate: settings.sampleRate, // Увага: на iOS тут буде 44100 або 48000
          echoCancellation: settings.echoCancellation,
        });

        // Створюємо AudioContext
        if (isSafari || isIOS) {
          // Safari: використовуємо нативний конструктор
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('Safari AudioContext sampleRate:', this.audioContext.sampleRate);
        } else {
          try {
            this.audioContext = await audioContext({ sampleRate: this.sampleRate });
          } catch (e) {
            console.warn('Не вдалося встановити sampleRate, використовується системний:', e);
            this.audioContext = new AudioContext();
          }
        }

        // 3. ПИНОК ДЛЯ iOS (iOS Audio Context Unlock)
        // Це критично важливо. Якщо контекст "suspended", мікрофон не піде в worklet.
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // ХАК: Програємо 1 семпл тиші. Це змушує iOS перемкнути режим на "PlayAndRecord"
        // без необхідності запускати Диктофон.
        try {
            const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            console.log('🔊 iOS Audio Unlock applied');
        } catch(e) {
            console.warn('iOS Unlock failed', e);
        }

        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Підключаємо AudioWorklet для запису
        const workletName = 'audio-recorder-worklet';
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);
        await this.audioContext.audioWorklet.addModule(src);
        
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );
        
        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // ТУТ ВАЖЛИВО:
          // Оскільки на iOS sampleRate буде 48000, а Gemini чекає 16000,
          // переконайтеся, що ваш AudioRecordingWorklet робить downsampling!
          // Якщо ні - Gemini отримає "швидкий" голос або сміття.
          
          const arrayBuffer = ev.data.data.int16arrayBuffer;
          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit('data', arrayBufferString);
          }
        };
        
        this.source.connect(this.recordingWorklet);

        // VU meter worklet
        const vuWorkletName = 'vu-meter';
        await this.audioContext.audioWorklet.addModule(
          createWorketFromSrc(vuWorkletName, VolMeterWorket)
        );
        
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit('volume', ev.data.volume);
        };
        
        this.source.connect(this.vuWorklet);

        this.recording = true;
        resolve();
        this.starting = null;
      } catch (error) {
        console.error('❌ Помилка запуску:', error);
        reject(error);
        this.starting = null;
      }
    });

    return this.starting;
  }

  stop() {
    const handleStop = () => {
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.recording = false;
    };

    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }
    
    handleStop();
  }
}
