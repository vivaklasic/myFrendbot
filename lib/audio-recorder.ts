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
  // Для воспроизведения через Bluetooth
  private audioElement: HTMLAudioElement | undefined;

  constructor(public sampleRate = 16000) {
    super();
  }

  async getAudioInputs(): Promise<MediaDeviceInfo[]> {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.error('Не вдалося отримати дозвіл на мікрофон:', e);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  }

  /**
   * КРИТИЧНО: Активувати Bluetooth HSP/HFP профіль для мікрофона
   * Це примусово перемикає Bluetooth з A2DP (тільки музика) на HSP (дзвінки)
   */
  private async activateBluetoothProfile(): Promise<MediaStream | null> {
    try {
      console.log('🎧 Спроба активувати Bluetooth HSP/HFP профіль...');
      
      // MAGIC: Запитуємо echoCancellation: true - це сигнал для Android 
      // перемкнути Bluetooth на HSP/HFP профіль (для дзвінків)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,  // КРИТИЧНО для активації Bluetooth мікрофона
          noiseSuppression: true,
          autoGainControl: true,
          // НЕ вказуємо deviceId - дозволяємо системі вибрати "communications" пристрій
        }
      });

      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      
      console.log('✅ Активовано аудіопристрій:', {
        label: track.label,
        sampleRate: settings.sampleRate,
        echoCancellation: settings.echoCancellation,
        deviceId: settings.deviceId
      });

      // Перевірка: якщо sampleRate = 8000 або 16000, це HSP/HFP (добре!)
      // Якщо 44100 або 48000, це все ще A2DP (погано)
      if (settings.sampleRate && settings.sampleRate <= 16000) {
        console.log('✅ Bluetooth HSP/HFP профіль АКТИВОВАНО (sampleRate:', settings.sampleRate, 'Hz)');
        return stream;
      } else {
        console.warn('⚠️ Можливо, Bluetooth все ще в A2DP режимі (sampleRate:', settings.sampleRate, 'Hz)');
        return stream;
      }
    } catch (error) {
      console.error('❌ Помилка активації Bluetooth профілю:', error);
      return null;
    }
  }

  /**
   * Налаштувати відтворення звуку через Bluetooth-навушники
   */
  private setupBluetoothPlayback() {
    // Створюємо прихований audio елемент для маршрутизації звуку
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio');
      this.audioElement.autoplay = true;
      this.audioElement.muted = false;
      
      // ВАЖЛИВО: srcObject з MediaStream автоматично використовує той самий 
      // аудіопристрій, що і для запису (Bluetooth)
      if (this.stream) {
        this.audioElement.srcObject = this.stream;
      }
    }
  }

  async start(deviceId?: string) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // КРОК 1: Активувати Bluetooth HSP/HFP профіль
        this.stream = await this.activateBluetoothProfile();
        
        if (!this.stream) {
          throw new Error('Не вдалося отримати аудіопотік');
        }

        // КРОК 2: Налаштувати відтворення через Bluetooth
        this.setupBluetoothPlayback();

        // Safari compatibility
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isSafari) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('Safari: використовується нативний sampleRate:', this.audioContext.sampleRate);
        } else {
          // Для HSP/HFP профілю система сама обере правильний sampleRate (8000 або 16000)
          // Не примусово встановлюємо його
          try {
            this.audioContext = new AudioContext();
            console.log('AudioContext sampleRate:', this.audioContext.sampleRate);
          } catch (e) {
            console.warn('Помилка створення AudioContext:', e);
            this.audioContext = new AudioContext();
          }
        }

        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = 'audio-recorder-worklet';
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);
        await this.audioContext.audioWorklet.addModule(src);
        
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );
        
        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
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
        console.log('🎤 Запис розпочато через Bluetooth');
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

  /**
   * Відтворити аудіо через Bluetooth-навушники
   * Викликати, коли бот відповідає
   */
  playAudioThroughBluetooth(audioBlob: Blob) {
    if (!this.audioElement) {
      this.audioElement = document.createElement('audio');
      this.audioElement.autoplay = true;
      document.body.appendChild(this.audioElement);
    }
    
    const url = URL.createObjectURL(audioBlob);
    this.audioElement.src = url;
    this.audioElement.play().catch(e => {
      console.error('Помилка відтворення:', e);
    });
    
    this.audioElement.onended = () => {
      URL.revokeObjectURL(url);
    };
  }

  stop() {
    const handleStop = () => {
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.recording = false;
      
      // Очистити audio element
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.srcObject = null;
        this.audioElement.src = '';
        if (this.audioElement.parentNode) {
          this.audioElement.parentNode.removeChild(this.audioElement);
        }
        this.audioElement = undefined;
      }
      
      console.log('🛑 Запис зупинено');
    };

    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }
    
    handleStop();
  }
}
