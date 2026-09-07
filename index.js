Page({
  data: {
    powderOptions: ['快凝型 (Fast Set)', '普通型 (Normal Set)', '变色指示型 (Color Change)'],
    powderIndex: 1,
    ratio: 1.0,
    ambientTemp: 25,
    waterTemp: 23,
    humidity: 50,
    showSim: false,
    running: false,
    timeLeft: 0,
    currentStage: {},
    phase: {}
  },

  // 页面全局定时器变量
  timer: null,

  onPowderChange(e) { this.setData({ powderIndex: e.detail.value }); },
  onRatioChange(e) { this.setData({ ratio: parseFloat(e.detail.value) }); },
  onAmbientTempChange(e) { this.setData({ ambientTemp: e.detail.value }); },
  onTempChange(e) { this.setData({ waterTemp: e.detail.value }); },
  onHumidityChange(e) { this.setData({ humidity: e.detail.value }); },

  calculatePhases() {
    const { powderIndex, ratio, ambientTemp, waterTemp, humidity } = this.data;
    
    let basePremix = 15; 
    let baseMix = 35;    
    let baseLoad = 30;   
    let baseSet = 120;   
    let basePourMax = 15; 

    let waterTempFactor = Math.pow(0.95, waterTemp - 23);
    let ambientTempFactor = Math.pow(0.97, ambientTemp - 25);
    let ratioFactor = ratio; 
    let humidityFactor = humidity < 40 ? 0.7 : (humidity > 80 ? 1.2 : 1.0);

    if (powderIndex === 0) {
      basePremix *= 0.7; baseMix *= 0.7; baseLoad *= 0.7; baseSet *= 0.7;
    }

    return {
      premix: Math.round(basePremix * ratioFactor),
      mix: Math.round(baseMix * waterTempFactor * ratioFactor),
      load: Math.round(baseLoad * waterTempFactor * ambientTempFactor),
      set: Math.round(baseSet * ambientTempFactor * ratioFactor),
      pourWindowMin: Math.round(basePourMax * humidityFactor)
    };
  },

  toggleSimulation() {
    if (this.data.showSim) {
      this.setData({ showSim: false });
    } else {
      this.setData({
        phase: this.calculatePhases(),
        showSim: true
      });
    }
  },

  speak(text) {
    wx.vibrateLong().catch(() => {});
    try {
      const plugin = requirePlugin("WechatSI");
      if (plugin && plugin.textToSpeech) {
        plugin.textToSpeech({
          lang: "zh_CN",
          content: text,
          success: (res) => {
            wx.playBackgroundAudio({ dataUrl: res.filename });
          }
        });
      }
    } catch (e) {
      // 捕获未配置同声传译插件时的异常，防止程序崩溃卡死
      console.log("语音插件未配置或不可用:", e);
    }
  },

  startProcess() {
    // 启动前先清理旧定时器
    this.stopProcess();

    const p = this.calculatePhases();
    const stages = [
      { name: '1. 混合材料', duration: p.premix, prompt: '先加水再加粉末，轻轻压拌至粉末完全浸湿，防止飞溅' },
      { name: '2. 快速调拌', duration: p.mix, prompt: '用力顺时针刮抹碗壁，快速调拌至无颗粒糊状' },
      { name: '3. 静置消泡', duration: p.load, prompt: '注意时间，轻拍容器让气泡排出' },
      { name: '4. 开始倒模', duration: p.set, prompt: '倒入成型容器后插入要翻模的物体' },
      { name: '5. 凝固完成', duration: 10, prompt: `完全凝固！受环境温度 ${this.data.ambientTemp}°C 与湿度 ${this.data.humidity}%RH 影响，请在 ${p.pourWindowMin} 分钟内完成灌模` }
    ];

    this.setData({ running: true });
    let stageIdx = 0;

    const runNextStage = () => {
      if (stageIdx >= stages.length) {
        this.stopProcess();
        return;
      }

      const st = stages[stageIdx];
      
      // 先更新界面 UI
      this.setData({
        currentStage: st,
        timeLeft: st.duration
      });

      // 播放提示
      this.speak(st.prompt);

      let time = st.duration;

      // 开启倒计时循环
      this.timer = setInterval(() => {
        time--;
        if (time >= 0) {
          this.setData({ timeLeft: time });
        } else {
          // 当前阶段倒计时结束，清理当前定时器并进入下一阶段
          if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
          }
          stageIdx++;
          runNextStage();
        }
      }, 1000);
    };

    runNextStage();
  },

  stopProcess() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setData({
      running: false,
      timeLeft: 0
    });
  },

  // 页面卸载时清理定时器，防止内存泄漏
  onUnload() {
    this.stopProcess();
  }
});