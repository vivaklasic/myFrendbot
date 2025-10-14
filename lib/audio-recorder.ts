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
        // БазовіConstrainst для аудіо
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        // Якщо передано deviceId - використовуємо його
        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId };
          console.log('🎯 Використовуємо конкретний пристрій:', deviceId);
        } else {
          console.log('🎯 Використовуємо пристрій за замовчуванням');
        }

        // Отримуємо MediaStream
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints 
        });

        // Логування інформації про активний пристрій
        const track = this.stream.getAudioTracks()[0];
        const settings = track.getSettings();
        console.log('✅ Активовано:', {
          label: track.label,
          deviceId: settings.deviceId,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
        });

        // Створюємо AudioContext
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isSafari) {
          // Safari: використовуємо нативний конструктор
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('Safari AudioContext sampleRate:', this.audioContext.sampleRate);
        } else {
          // Chrome/Firefox: можемо спробувати задати sampleRate
          try {
            this.audioContext = await audioContext({ sampleRate: this.sampleRate });
          } catch (e) {
            console.warn('Не вдалося встановити sampleRate, використовується системний:', e);
            this.audioContext = new AudioContext();
          }
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
