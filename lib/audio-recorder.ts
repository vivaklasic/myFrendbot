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
   * Отримати список доступних аудіовходів
   */
  async getAudioInputs(): Promise<MediaDeviceInfo[]> {
    // Спочатку потрібен дозвіл
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.error('Не вдалося отримати дозвіл на мікрофон:', e);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  }

  async start(deviceId?: string) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media');
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        // Якщо deviceId не вказано, спробуємо знайти Bluetooth автоматично
        let selectedDeviceId = deviceId;
        
        if (!selectedDeviceId) {
          const devices = await this.getAudioInputs();
          console.log('Доступні аудіовходи:', devices.map(d => ({
            id: d.deviceId,
            label: d.label,
            groupId: d.groupId
          })));

          // Шукаємо Bluetooth-пристрій (часто містить "Bluetooth", "BT", "headset" в назві)
          const bluetoothDevice = devices.find(d => 
            d.label.toLowerCase().includes('bluetooth') ||
            d.label.toLowerCase().includes('headset') ||
            d.label.toLowerCase().includes('airpods') ||
            d.label.toLowerCase().includes('buds')
          );

          if (bluetoothDevice) {
            selectedDeviceId = bluetoothDevice.deviceId;
            console.log('Знайдено Bluetooth-пристрій:', bluetoothDevice.label);
          } else {
            console.warn('Bluetooth-пристрій не знайдено, використовується пристрій за замовчуванням');
          }
        }

        // Налаштування аудіо з урахуванням Safari
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        // Додаємо deviceId якщо є
        if (selectedDeviceId) {
          audioConstraints.deviceId = { exact: selectedDeviceId };
        }

        // Safari не підтримує sampleRate в constraints, тому не додаємо його
        // sampleRate буде встановлено через AudioContext

        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints 
        });

        // Перевіряємо, чи отримали правильний пристрій
        const track = this.stream.getAudioTracks()[0];
        const settings = track.getSettings();
        console.log('Використовується аудіопристрій:', {
          label: track.label,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          deviceId: settings.deviceId
        });

        // Safari потребує взаємодії користувача перед створенням AudioContext
        // Також Safari має проблеми з кастомним sampleRate
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isSafari) {
          // Для Safari використовуємо дефолтний sampleRate
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('Safari: використовується нативний sampleRate:', this.audioContext.sampleRate);
        } else {
          // Для інших браузерів намагаємося встановити бажаний sampleRate
          try {
            this.audioContext = await audioContext({ sampleRate: this.sampleRate });
          } catch (e) {
            console.warn('Не вдалося встановити sampleRate, використовується дефолтний:', e);
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
        resolve();
        this.starting = null;
      } catch (error) {
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
