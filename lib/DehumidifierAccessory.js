const BaseAccessory = require("./BaseAccessory");

class DehumidifierAccessory extends BaseAccessory {
  static getCategory(Categories) {
    return Categories.AIR_DEHUMIDIFIER;
  }

  constructor(...props) {
    super(...props);

    this.defaultDps = {
      Active: 1,
      Mode: 5, // Continuities|Auto|Sleep
      Humidity: 2,
      FanSpeed: 4, // low|high
      ChildLock: 16,
      Fault: 19,
      //   CurrentTemperature: 7,
      CurrentHumidity: 6,
    };

    this.relativeHumidityDehumidifierThresholdTimer = null;
    this.rotationSpeedTimer = null;
  }

  _registerPlatformAccessory() {
    const { Service } = this.hap;

    this.accessory.addService(
      Service.HumidifierDehumidifier,
      this.device.context.name,
    );

    super._registerPlatformAccessory();
  }

  _registerCharacteristics(dps) {
    const { Service, Characteristic } = this.hap;

    const infoService = this.accessory.getService(Service.AccessoryInformation);
    infoService
      .getCharacteristic(Characteristic.Manufacturer)
      .updateValue(this.device.context.manufacturer);
    infoService
      .getCharacteristic(Characteristic.Model)
      .updateValue(this.device.context.model);

    const service = this.accessory.getService(Service.HumidifierDehumidifier);
    this._checkServiceName(service, this.device.context.name);

    this.characteristicActive = service.getCharacteristic(
      Characteristic.Active,
    );
    this.characteristicActive
      .updateValue(this._getActive(dps[this.getDp("Active")]))
      .on("get", this.getActive.bind(this))
      .on("set", this.setActive.bind(this));

    service
      .getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .updateValue(
        this._getCurrentHumidifierDehumidifierState(dps[this.getDp("Active")]),
      )
      .on("get", this.getCurrentHumidifierDehumidifierState.bind(this));

    this.characteristicTargetHumidifierDehumidifierState = service
      .getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .updateValue(this._getTargetHumidifierDehumidifierState(dps))
      .on("get", this.getTargetHumidifierDehumidifierState.bind(this))
      .on("set", this.setTargetHumidifierDehumidifierState.bind(this));

    const characteristicCurrentRelativeHumidity = service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .updateValue(dps[this.getDp("CurrentHumidity")])
      .on("get", this.getState.bind(this, this.getDp("CurrentHumidity")));

    this.characteristicLockPhysicalControls = service.getCharacteristic(
      Characteristic.LockPhysicalControls,
    );
    this.characteristicLockPhysicalControls
      .updateValue(this._getLockPhysicalControls(dps[this.getDp("ChildLock")]))
      .on("get", this.getLockPhysicalControls.bind(this))
      .on("set", this.setLockPhysicalControls.bind(this));

    this.characteristicRelativeHumidityDehumidifierThreshold =
      service.getCharacteristic(
        Characteristic.RelativeHumidityDehumidifierThreshold,
      );
    this.characteristicRelativeHumidityDehumidifierThreshold
      .setProps({
        minStep: this.device.context.humiditySteps || 5,
      })
      .updateValue(dps[this.getDp("Humidity")])
      .on("get", this.getState.bind(this, this.getDp("Humidity")))
      .on("set", this.setRelativeHumidityDehumidifierThreshold.bind(this));

    this._removeCharacteristic(
      service,
      Characteristic.RelativeHumidityHumidifierThreshold,
    );

    this.characteristicRotationSpeed = service.getCharacteristic(
      Characteristic.RotationSpeed,
    );
    this.characteristicRotationSpeed
      .updateValue(this._getRotationSpeed(dps))
      .on("get", this.getRotationSpeed.bind(this))
      .on("set", this.setRotationSpeed.bind(this));

    this._removeCharacteristic(service, Characteristic.SwingMode);

    const characteristicWaterLevel = service
      .getCharacteristic(Characteristic.WaterLevel)
      .updateValue(this._getWaterLevel(dps[this.getDp("Fault")]))
      .on("get", this.getWaterLevel.bind(this));

    this.device.on("change", (changes, state) => {
      const newState = { ...state, ...changes };

      if (changes.hasOwnProperty(this.getDp("ChildLock"))) {
        const newChildLock = this._getLockPhysicalControls(
          changes[this.getDp("ChildLock")],
        );
        if (this.characteristicLockPhysicalControls.value !== newChildLock)
          this.characteristicLockPhysicalControls.updateValue(newChildLock);
      }

      const active = this._getActive(newState[this.getDp("Active")]);
      if (this.characteristicActive.value !== active) {
        this.characteristicActive.updateValue(active);
      }

      const mode = this._getTargetHumidifierDehumidifierState(newState);
      if (
        active &&
        this.characteristicTargetHumidifierDehumidifierState.value !== mode
      )
        this.characteristicTargetHumidifierDehumidifierState.updateValue(mode);

      const fanSpeed = this._getRotationSpeed(newState);
      if (active && this.characteristicRotationSpeed.value !== fanSpeed)
        this.characteristicRotationSpeed.updateValue(fanSpeed);

      if (
        changes.hasOwnProperty(this.getDp("Humidity")) &&
        this.characteristicRelativeHumidityDehumidifierThreshold.value !=
          changes[this.getDp("Humidity")]
      )
        this.characteristicRelativeHumidityDehumidifierThreshold.updateValue(
          changes[this.getDp("Humidity")],
        );

      if (
        changes.hasOwnProperty(this.getDp("Fault")) &&
        characteristicWaterLevel.value !==
          this._getWaterLevel(changes[this.getDp("Fault")])
      )
        characteristicWaterLevel.updateValue(
          this._getWaterLevel(changes[this.getDp("Fault")]),
        );
    });

    setInterval(() => {
      const currentRH = this.device.state[this.getDp("CurrentHumidity")];
      if (characteristicCurrentRelativeHumidity.value != currentRH)
        characteristicCurrentRelativeHumidity.updateValue(currentRH);
    }, 30000);
  }

  getActive(callback) {
    this.log.info(`getActive`);
    this.getState(this.getDp("Active"), (err, dp) => {
      if (err) return callback(err);

      callback(null, this._getActive(dp));
    });
  }

  _getActive(dp) {
    const { Characteristic } = this.hap;

    return dp ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
  }

  setActive(value, callback) {
    this.log.info(`setActive: ${value}`);
    const { Characteristic } = this.hap;

    if (this.device.state[this.getDp("ChildLock")]) {
      setTimeout(() => {
        this.characteristicTargetHumidifierDehumidifierState.updateValue(
          this._getTargetHumidifierDehumidifierState(this.device.state),
        );
        this.characteristicActive.updateValue(
          this._getActive(this.device.state[this.getDp("Active")]),
        );
      }, 1000);

      return callback();
    }

    switch (value) {
      case Characteristic.Active.ACTIVE:
        return callback(); // Activated elsewhere

      case Characteristic.Active.INACTIVE:
        return this.setState(this.getDp("Active"), false, callback);
    }

    return callback();
  }

  setActiveAndWait() {
    try {
      this.setState(this.getDp("Active"), true);

      const isActiveSet = this.retryUntilConditionMet(
        () => this.device.state[this.getDp("Active")],
        4, // maxAttempts
        500, // delayInMs
      );

      if (!isActiveSet) {
        this.log.info(
          "Failed to set 'Active' to true within the allowed retries. Skipping mode setting.",
        );
        return false;
      }

      return true;
    } catch (error) {
      this.log.error("An error occurred while setting device active:", error);
      return false;
    }
  }

  retryUntilConditionMet(conditionFn, maxAttempts, delayInMs) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (conditionFn()) {
        return true;
      }
      const start = Date.now();
      while (Date.now() - start < delayInMs) {}
    }
    return false;
  }

  getWaterLevel(callback) {
    this.log.info(`getWaterLevel`);
    this.getState(this.getDp("Fault"), (err, dp) => {
      if (err) return callback(err);

      callback(null, this._getWaterLevel(dp));
    });
  }

  _getWaterLevel(dp) {
    return dp ? 100 : 50;
  }

  getLockPhysicalControls(callback) {
    this.log.info(`getLockPhysicalControls`);
    this.getState(this.getDp("ChildLock"), (err, dp) => {
      if (err) return callback(err);

      callback(null, this._getLockPhysicalControls(dp));
    });
  }

  _getLockPhysicalControls(dp) {
    const { Characteristic } = this.hap;

    return dp
      ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
      : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
  }

  setLockPhysicalControls(value, callback) {
    this.log.info(`setLockPhysicalControls: ${value}`);
    if (!this.device.state[this.getDp("Active")]) {
      setTimeout(
        () =>
          this.characteristicLockPhysicalControls.updateValue(
            this._getLockPhysicalControls(false),
          ),
        1000,
      );
      return callback();
    }
    return this.setState(
      this.getDp("ChildLock"),
      value ? true : false,
      callback,
    );
  }

  getRotationSpeed(callback) {
    this.log.info(`getRotationSpeed`);
    this.getState(
      [this.getDp("Active"), this.getDp("FanSpeed")],
      (err, dps) => {
        if (err) return callback(err);

        callback(null, this._getRotationSpeed(dps));
      },
    );
  }

  _getRotationSpeed(dps) {
    if (!dps[this.getDp("Active")]) return 0;
    switch (dps[this.getDp("FanSpeed")]) {
      case "low":
        return 50;
      case "high":
        return 100;
    }
    return 0;
  }

  setRotationSpeed(value, callback) {
    // Clear the existing timer if the method is called again
    if (this.rotationSpeedTimer) {
      clearTimeout(this.rotationSpeedTimer);
      this.rotationSpeedTimer = null;
    }

    this.log.info(`setRotationSpeed: ${value}`);

    // Start a new timer for 3 seconds
    this.rotationSpeedTimer = setTimeout(() => {
      this.log.info(`Executing setRotationSpeed for value: ${value}`);

      if (this.device.state[this.getDp("ChildLock")]) {
        this.characteristicRotationSpeed.updateValue(
          this.device.state[this.getDp("FanSpeed")] === "low" ? 50 : 100,
        );
        return callback();
      }

      let origValue = value;
      value = Math.round(value / 50) * 50;
      if (origValue !== value) {
        this.characteristicRotationSpeed.updateValue(value);
      }

      if (!this.device.state[this.getDp("Active")]) {
        this.characteristicActive.updateValue(true);
        const isActive = this.setActiveAndWait();
        if (!isActive) return callback(true);
      }

      switch (value) {
        case 0:
          callback(false);
          break;
        case 50:
          this.setState(this.getDp("FanSpeed"), "low", callback);
          break;
        case 100:
          this.setState(this.getDp("FanSpeed"), "high", callback);
          break;
      }
    }, 3000); // 3 seconds delay
  }

  setRelativeHumidityDehumidifierThreshold(value, callback) {
    // Clear existing timer if the method is called again
    if (this.relativeHumidityDehumidifierThresholdTimer) {
      clearTimeout(this.relativeHumidityDehumidifierThresholdTimer);
      this.relativeHumidityDehumidifierThresholdTimer = null;
    }

    this.log.info(
      `setRelativeHumidityDehumidifierThreshold called with: ${value}`,
    );

    // Start a new timer for 3 seconds
    this.relativeHumidityDehumidifierThresholdTimer = setTimeout(() => {
      this.log.info(
        `Executing setRelativeHumidityDehumidifierThreshold for value: ${value}`,
      );

      if (
        this.device.state[this.getDp("ChildLock")] ||
        !this.device.state[this.getDp("Active")]
      ) {
        const currentHumidity = this.device.state[this.getDp("Humidity")];
        this.log.info(
          `Operation blocked due to ChildLock or inactive state. Current Humidity: ${currentHumidity}`,
        );
        this.characteristicRelativeHumidityDehumidifierThreshold.updateValue(
          currentHumidity,
        );
        return callback();
      }

      // Adjust the value within the allowed humidity range
      const minHumidity = this.device.context.minHumidity || 40;
      const maxHumidity = this.device.context.maxHumidity || 80;
      const adjustedValue = Math.min(Math.max(value, minHumidity), maxHumidity);

      if (value !== adjustedValue) {
        this.log.info(
          `Input value adjusted from ${value} to within range: ${adjustedValue}`,
        );
        this.characteristicRelativeHumidityDehumidifierThreshold.updateValue(
          adjustedValue,
        );
      }

      // Update the state with the adjusted value
      this.log.info(`Setting Humidity to: ${adjustedValue}`);
      this.setState(this.getDp("Humidity"), adjustedValue, callback);
    }, 3000); // 3 seconds delay
  }

  getCurrentHumidifierDehumidifierState(callback) {
    this.log.info(`getCurrentHumidifierDehumidifierState`);
    this.getState(this.getDp("Active"), (err, dp) => {
      if (err) return callback(err);

      callback(null, this._getCurrentHumidifierDehumidifierState(dp));
    });
  }

  _getCurrentHumidifierDehumidifierState(dp) {
    const { Characteristic } = this.hap;

    return dp
      ? Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING
      : Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
  }

  targetStateToMode(state) {
    const { Characteristic } = this.hap;

    switch (state) {
      case Characteristic.TargetHumidifierDehumidifierState
        .HUMIDIFIER_OR_DEHUMIDIFIER:
        return "Auto";
      case Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER:
        return "Continuities";
      case Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER:
        return "Sleep";
    }
    return "Continuities";
  }

  modeToTargetState(mode) {
    const { Characteristic } = this.hap;

    switch (mode) {
      case "Auto":
        return Characteristic.TargetHumidifierDehumidifierState
          .HUMIDIFIER_OR_DEHUMIDIFIER;
      case "Continuities":
        return Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
      case "Sleep":
        return Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
    }
    return Characteristic.Active.INACTIVE;
  }

  getTargetHumidifierDehumidifierState(callback) {
    this.log.info(`getTargetHumidifierDehumidifierState`);
    this.getState([this.getDp("Active"), this.getDp("Mode")], (err, dps) => {
      if (err) return callback(err);

      callback(null, this._getTargetHumidifierDehumidifierState(dps));
    });
  }

  _getTargetHumidifierDehumidifierState(dps) {
    const { Characteristic } = this.hap;

    if (!dps[this.getDp("Active")]) return Characteristic.Active.INACTIVE;
    return this.modeToTargetState(dps[this.getDp("Mode")]);
  }

  setTargetHumidifierDehumidifierState(value, callback) {
    this.log.info(`setTargetHumidifierDehumidifierState: ${value}`);

    if (this.device.state[this.getDp("ChildLock")]) {
      this.characteristicTargetHumidifierDehumidifierState.updateValue(
        this.modeToTargetState(this.device.state[this.getDp("Mode")]),
      );
      return callback();
    }

    if (!this.device.state[this.getDp("Active")]) {
      this.characteristicActive.updateValue(true);
      const isActive = this.setActiveAndWait();
      if (!isActive) return callback(true);
    }

    return this.setState(
      this.getDp("Mode"),
      this.targetStateToMode(value),
      callback,
    );
  }

  getDp(name) {
    return this.device.context["dps" + name]
      ? this.device.context["dps" + name]
      : this.defaultDps[name];
  }
}

module.exports = DehumidifierAccessory;
