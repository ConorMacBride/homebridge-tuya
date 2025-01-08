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

        this.accessory.addService(Service.HumidifierDehumidifier, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;

        const infoService = this.accessory.getService(Service.AccessoryInformation);
        infoService.getCharacteristic(Characteristic.Manufacturer).updateValue(this.device.context.manufacturer);
        infoService.getCharacteristic(Characteristic.Model).updateValue(this.device.context.model);

        const service = this.accessory.getService(Service.HumidifierDehumidifier);
        this._checkServiceName(service, this.device.context.name);

        this.characteristicActive = service.getCharacteristic(Characteristic.Active)
        this.characteristicActive.updateValue(this._getActive(dps[this.getDp('Active')]))
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));
        
        service.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
            .updateValue(this._getCurrentHumidifierDehumidifierState(dps[this.getDp('Active')]))
            .on('get', this.getCurrentHumidifierDehumidifierState.bind(this))

        this.characteristicTargetHumidifierDehumidifierState = service.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
            .updateValue(this._getTargetHumidifierDehumidifierState(dps))
            .on('get', this.getTargetHumidifierDehumidifierState.bind(this))
            .on('set', this.setTargetHumidifierDehumidifierState.bind(this))
        
        const characteristicCurrentHumidity = service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .updateValue(this._getCurrentHumidity(dps[this.getDp('CurrentHumidity')]))
            .on('get', this.getCurrentHumidity.bind(this));
        
        this.characteristicChildLock = service.getCharacteristic(Characteristic.LockPhysicalControls)
        this.characteristicChildLock.updateValue(this._getLockTargetState(dps[this.getDp('ChildLock')]))
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
        
        this._removeCharacteristic(service, Characteristic.SwingMode);

        const characteristicWaterLevel = service.getCharacteristic(Characteristic.WaterLevel)
            .updateValue(this._getTankState(dps[this.getDp('Fault')]))
            .on('get', this.getTankState.bind(this))

        this.device.on('change', (changes, state) => {

            if (this.characteristicChildLock && changes.hasOwnProperty(this.getDp('ChildLock'))) {
                const newChildLock = this._getLockTargetState(changes[this.getDp('ChildLock')]);
                if (this.characteristicChildLock.value !== newChildLock) this.characteristicChildLock.updateValue(newChildLock);
            }

            var changedActiveStatus = false
            if (changes.hasOwnProperty(this.getDp('Active'))) {
                const newActive = this._getActive(changes[this.getDp('Active')]);
                if (this.characteristicActive.value !== newActive) {
                    this.characteristicActive.updateValue(newActive);
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

            if (changes.hasOwnProperty(this.getDp('Humidity')) && this.characteristicHumidity.value !== changes[this.getDp('Humidity')]) this.characteristicHumidity.updateValue(changes[this.getDp('Humidity')]);

            if (changes.hasOwnProperty(this.getDp('WaterLevel')) && characteristicWaterLevel.value !== this._getTankState(changes[this.getDp('Fault')])) characteristicWaterLevel.updateValue(this._getTankState(changes[this.getDp('Fault')]));

            // TODO: update the mode
        });

        setInterval(() => {
            characteristicCurrentHumidity.updateValue(this.device.state[this.getDp('CurrentHumidity')]);
        }, 30000);
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

        if (this.device.state[this.getDp('Active')] !== value) {
            switch (value) {
                case Characteristic.Active.ACTIVE:
                    return this.setState(this.getDp('Active'), true, callback);

                case Characteristic.Active.INACTIVE:
                    return this.setState(this.getDp('Active'), false, callback);
            }
        }

        return callback();
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

        if (!this.device.state[this.getDp('Active')]) {
            this.characteristicChildLock.updateValue(false);
            return callback();
        }  // TODO: when lock is true: mode, fan speed, humidity cannot be changed

        if (this.device.state[this.getDp('ChildLock')] !== value) {
            if (value) {
                return this.setState(this.getDp('ChildLock'), true, callback);
            }
            return this.setState(this.getDp('ChildLock'), false, callback);
        }
        return callback();
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

        if (this.device.state[this.getDp('ChildLock')]) {
            this.characteristicRotationSpeed.updateValue(this.device.state[this.getDp('FanSpeed')] == 'low' ? 50 : 100)
            return callback();
        }

        if (!this.device.state[this.getDp('Active')]) {
            if (value !== 0) this.characteristicRotationSpeed.updateValue(0);
            return callback();
        }

        let origValue = value;
        value = Math.round(value / 50) * 50;
        if (origValue != value) {
            this.characteristicRotationSpeed.updateValue(value);
        }

        let fanSpeed;
        switch (value) {
            case 0:
                this.setState(this.getDp('Active'), false, callback);
                return this.characteristicActive.updateValue(false);
            case 50:
                fanSpeed = 'low';
                break;
            case 100:
                fanSpeed = 'high';
        }
        if (this.device.state[this.getDp('FanSpeed')] !== fanSpeed) return this.setState(this.getDp('FanSpeed'), fanSpeed, callback);

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
        if (this.device.state[this.getDp('ChildLock')]) {
            this.characteristicHumidity.updateValue(this.device.state[this.getDp('Humidity')])
            return callback();
        }

        let origValue = value;
        value = Math.max(value, this.device.context.minHumidity || 40);
        value = Math.min(value, this.device.context.maxHumidity || 80);
        if (origValue != value) {
            this.characteristicHumidity.updateValue(value);
        }

        if (this.device.state[this.getDp('Active')]) {
            this.setState(this.getDp('Humidity'), value, callback);
        }
    }

    getCurrentHumidifierDehumidifierState(callback) {
        this.getState(this.getDp('Active'), (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getCurrentHumidifierDehumidifierState(dp));
        });
    }

    _getCurrentHumidifierDehumidifierState(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING : Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    }

    getTargetHumidifierDehumidifierState(callback) {
        this.getState([this.getDp('Active'), this.getDp('Mode')], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getTargetHumidifierDehumidifierState(dps));
        });
    }

    _getTargetHumidifierDehumidifierState(dps) {
        const {Characteristic} = this.hap;

        if (!dps[this.getDp('Active')]) return Characteristic.Active.INACTIVE;
        
        switch (dps[this.getDp('Mode')]) {
            case 'Auto':
                return Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
            case 'Continuities':
                return Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
            case 'Sleep':
                return Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
        }
    }

    setTargetHumidifierDehumidifierState(value, callback) {
        const {Characteristic} = this.hap;

        if (this.device.state[this.getDp('ChildLock')]) {
            // TODO: tidy
            let prevChar;
            switch (this.device.state[this.getDp('Mode')]) {
                case 'Auto':
                    prevChar = Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
                case 'Continuities':
                    prevChar = Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
                case 'Sleep':
                    prevChar = Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
            }
            this.characteristicTargetHumidifierDehumidifierState.updateValue(prevChar);
            return callback();
        }

        switch (value) {
            case Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER:
                this.setState(this.getDp('Mode'), 'Auto', callback);
                break;
            case Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER:
                this.setState(this.getDp('Mode'), 'Continuities', callback);
                break;
            case Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER:
                this.setState(this.getDp('Mode'), 'Sleep', callback);
        }
    }

    getDp(name) {
        return this.device.context['dps' + name] ? this.device.context['dps' + name] : this.defaultDps[name];
    }
}

module.exports = DehumidifierAccessory;
