const BaseAccessory = require('./BaseAccessory');

class DehumidifierAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.AIR_DEHUMIDIFIER;
    }

    constructor(...props) {
        super(...props);

        this.defaultDps = {
            'Active':     1,
            'Mode':       5, // Continuities|Auto|Sleep
            'Humidity':   2,
            'FanSpeed':   4, // low|high
            'ChildLock': 16,
            'Fault':     19,
            'CurrentTemperature': 7,
            'CurrentHumidity':    6,
        }
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.TemperatureSensor, this.device.context.name);
        this.accessory.addService(Service.HumiditySensor, this.device.context.name);
        this.accessory.addService(Service.HumidifierDehumidifier, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;

        const infoService = this.accessory.getService(Service.AccessoryInformation);
        infoService.getCharacteristic(Characteristic.Manufacturer).updateValue(this.device.context.manufacturer);
        infoService.getCharacteristic(Characteristic.Model).updateValue(this.device.context.model);

        this.accessory.getService(Service.TemperatureSensor)
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(this._getCurrentTemperature(dps[this.getDp('CurrentTemperature')]))
            .on('get', this.getCurrentTemperature.bind(this));

        this.accessory.getService(Service.HumiditySensor)
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .updateValue(this._getCurrentHumidity(dps[this.getDp('CurrentHumidity')]))
            .on('get', this.getCurrentHumidity.bind(this));

        const service = this.accessory.getService(Service.HumidifierDehumidifier);
        this._checkServiceName(service, this.device.context.name);

        const characteristicActive = service.getCharacteristic(Characteristic.Active)
            .updateValue(this._getActive(dps[this.getDp('Active')]))
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        service.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
            .updateValue(Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
        service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
            .updateValue(Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
        
        // const characteristicCurrentHumidifierDehumidifierState = service.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
        //     .updateValue(this._getCurrentHumidifierDehumidifierState(dps))  // TODO
        //     .on('get', this.getCurrentHumidifierDehumidifierState(this))  // TODO

        // const characteristicTargetHumidifierDehumidifierState = service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
        //     .updateValue(this._getTargetHumidifierDehumidifierState(dps)) // TODO
        //     .on('get', this.getTargetHumidifierDehumidifierState(dps))  //TODO
        //     .on('set', this.setTargetHumidifierDehumidifierState(dps))  //TODO
        
        const characteristicCurrentHumidity = service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .updateValue(this._getCurrentHumidity(dps[this.getDp('CurrentHumidity')]))
            .on('get', this.getCurrentHumidity.bind(this));
        
        const characteristicChildLock = service.getCharacteristic(Characteristic.LockPhysicalControls)
            .updateValue(this._getLockTargetState(dps[this.getDp('ChildLock')]))
            .on('get', this.getLockTargetState.bind(this))
            .on('set', this.setLockTargetState.bind(this))
        
        this.characteristicHumidity = service.getCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold);
        this.characteristicHumidity.setProps({
                minStep: this.device.context.humiditySteps || 5,
            })
            .updateValue(dps[this.getDp('Humidity')])
            .on('get', this.getState.bind(this, this.getDp('Humidity')))
            .on('set', this.setTargetHumidity.bind(this));
        
        this._removeCharacteristic(service, Characteristic.RelativeHumidityHumidifierThreshold);

        this.characteristicRotationSpeed = service.getCharacteristic(Characteristic.RotationSpeed)
        this.characteristicRotationSpeed.updateValue(this._getRotationSpeed(dps))
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this))
        
        // this._removeCharacteristic(service, Characteristic.SwingMode);
        service.getCharacteristic(Characteristic.SwingMode)
            .updateValue(Characteristic.SwingMode.SWING_DISABLED)

        const characteristicWaterLevel = service.getCharacteristic(Characteristic.WaterLevel)
            .updateValue(this._getTankState(dps[this.getDp('Fault')]))
            .on('get', this.getTankState.bind(this))

        this.device.on('change', (changes, state) => {

            if (characteristicChildLock && changes.hasOwnProperty(this.getDp('ChildLock'))) {
                const newChildLock = this._getLockTargetState(changes[this.getDp('ChildLock')]);
                if (characteristicChildLock.value !== newChildLock) characteristicChildLock.updateValue(newChildLock);
            }

            var changedActiveStatus = false
            if (changes.hasOwnProperty(this.getDp('Active'))) {
                const newActive = this._getActive(changes[this.getDp('Active')]);
                if (characteristicActive.value !== newActive) {
                    characteristicActive.updateValue(newActive);
                    changedActiveStatus = true;

                    var newFanSpeed;
                    if (changes.hasOwnProperty(this.getDp('FanSpeed'))) {
                        newFanSpeed = changes[this.getDp('FanSpeed')]
                    } else {
                        newFanSpeed = state[this.getDp('FanSpeed')]
                    }
                    const newSpeed = this._getRotationSpeedFromValues(newActive, newFanSpeed)
                    if (this.characteristicRotationSpeed.value !== newSpeed) this.characteristicRotationSpeed.updateValue(newSpeed);
                }
            }
            if (!changedActiveStatus && changes.hasOwnProperty(this.getDp('FanSpeed'))) {
                const newSpeed = this._getRotationSpeed(state);
                if (this.characteristicRotationSpeed.value !== newSpeed) this.characteristicRotationSpeed.updateValue(newSpeed);
            }

            if (changes.hasOwnProperty(this.getDp('CurrentHumidity')) && characteristicCurrentHumidity.value !== changes[this.getDp('CurrentHumidity')]) characteristicCurrentHumidity.updateValue(changes[this.getDp('CurrentHumidity')]);

            if (changes.hasOwnProperty(this.getDp('Humidity')) && this.characteristicHumidity.value !== changes[this.getDp('Humidity')]) this.characteristicHumidity.updateValue(changes[this.getDp('Humidity')]);

            if (changes.hasOwnProperty(this.getDp('WaterLevel')) && characteristicWaterLevel.value !== this._getTankState(changes[this.getDp('Fault')])) characteristicWaterLevel.updateValue(this._getTankState(changes[this.getDp('Fault')]));

        });
    }

    getActive(callback) {
        this.getState(this.getDp('Active'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getActive(dp));
        });
    }

    _getActive(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
    }

    setActive(value, callback) {
        const {Characteristic} = this.hap;

        switch (value) {
            case Characteristic.Active.ACTIVE:
                return this.setState(this.getDp('Active'), true, callback);

            case Characteristic.Active.INACTIVE:
                return this.setState(this.getDp('Active'), false, callback);
        }

        callback();
    }

    getTankState(callback) {
        this.getState(this.getDp('Fault'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTankState(dp));
        });
    }

    _getTankState(dp) {
        return dp ? 100 : 50;
    }

    getLockTargetState(callback) {
        this.getState(this.getDp('ChildLock'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getLockTargetState(dp));
        });
    }

    _getLockTargetState(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
    }

    setLockTargetState(value, callback) {
        if (this.device.context.noLock) return callback();

        if (value) {
            return this.setState(this.getDp('ChildLock'), true, callback);
        }
        return this.setState(this.getDp('ChildLock'), false, callback);
    }

    getRotationSpeed(callback) {
        this.getState([this.getDp('Active'), this.getDp('FanSpeed')], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getRotationSpeed(dps));
        });
    }

    _getRotationSpeed(dps) {
        return this._getRotationSpeedFromValues(dps[this.getDp('Active')], dps[this.getDp('FanSpeed')])
    }

    _getRotationSpeedFromValues(active, speed) {
        if (!active) return 0;
        switch (speed) {
            case 'low':
                return 50;
            case 'high':
                return 100;
        }
        return 0;
    }

    setRotationSpeed(value, callback) {
        if (this.device.context.noSpeed) return callback();

        let origValue = value;
        value = Math.round(value / 50) * 50;
        if (origValue != value) {
            this.characteristicRotationSpeed.updateValue(value);
        }

        switch (value) {
            case 0:
                this.setState(this.getDp('Active'), false, callback);
                break;
            case 50:
                this.setMultiState({[this.getDp('Active')]: true, [this.getDp('FanSpeed')]: 'low'}, callback);
                break;
            case 100:
                this.setMultiState({[this.getDp('Active')]: true, [this.getDp('FanSpeed')]: 'high'}, callback);
        }

        return callback();
    }

    getCurrentHumidity(callback) {
        this.getState(this.getDp('CurrentHumidity'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getCurrentHumidity(dp));
        });
    }

    _getCurrentHumidity(dp) {
        return dp;
    }

    getCurrentTemperature(callback) {
        this.getState(this.getDp('CurrentTemperature'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getCurrentTemperature(dp));
        });
    }

    _getCurrentTemperature(dp) {
        return dp;
    }

    getTargetHumidity(callback) {
        this.getState([this.getDp('Active'), this.getDp('Humidity')], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getTargetHumidity(dps));
        });
    }

    _getTargetHumidity(dps) {
        if (!dps[this.getDp('Active')]) return 0;

        return dps[this.getDp('Humidity')];
    }

    setTargetHumidity(value, callback) {
        const {Characteristic} = this.hap;

        let origValue = value;
        value = Math.max(value, this.device.context.minHumidity || 40);
        value = Math.min(value, this.device.context.maxHumidity || 80);
        if (origValue != value) {
            this.characteristicHumidity.updateValue(value);
        }

        this.setMultiState({[this.getDp('Active')]: true, [this.getDp('Humidity')]: value}, callback);
    }

    getDp(name) {
        return this.device.context['dps' + name] ? this.device.context['dps' + name] : this.defaultDps[name];
    }
}

module.exports = DehumidifierAccessory;
