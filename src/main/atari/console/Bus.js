// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

jt.Bus = function(pCpu, pTia, pPia, pRam) {

    function init(self) {
        cpu = pCpu;
        tia = pTia;
        pia = pPia;
        ram = pRam;
        cpu.connectBus(self);
        tia.connectBus(self);
        pia.connectBus(self);
    }

    this.powerOn = function() {
        data = 0;
        if (!cartridge) {
            tia.getVideoOutput().showOSD("NO CARTRIDGE INSERTED!", true);
            // Data in the bus comes random at powerOn if no Cartridge is present
	    // data = (Math.random()* 256) | 0;

            // Pitfall-agent: Do not alter the data to keep things deterministic.
        }
        // Power on devices connected to the BUS
        if (cartridge != null) cartridge.powerOn();
        ram.powerOn();
        pia.powerOn();
        cpu.powerOn();
        tia.powerOn();
    };

    this.powerOff = function() {
        tia.powerOff();
        cpu.powerOff();
        pia.powerOff();
        ram.powerOff();
    };

    this.setCartridge = function(pCartridge) {
        cartridge = pCartridge;
        if (cartridge) {
            data = 0;
            cartridge.connectBus(this);
        }
        cartridgeNeedsBusMonitoring = cartridge && cartridge.needsBusMonitoring();
    };

    this.getCartridge = function() {
        return cartridge;
    };

    this.getTia = function() {
        return tia;
    };

    this.clockPulse = function() {
        pia.clockPulse();
        cpu.clockPulse();
    };

    this.read = function(address) {
        // CART Bus monitoring
        if (cartridgeNeedsBusMonitoring) cartridge.monitorBusBeforeRead(address, data);

        if ((address & CART_MASK) === CART_SELECT) {
            if (cartridge) data = cartridge.read(address);
        } else if ((address & RAM_MASK) === RAM_SELECT) {
            data = ram.read(address);
        } else if ((address & PIA_MASK) === PIA_SELECT) {
            data = pia.read(address);
        } else {
            // Only bit 7 and 6 are connected to TIA read registers.
            data = data & 0x3f | tia.read(address);		// Use the retained data for bits 5-0
        }

        return data;
    };

    this.write = function(address, val) {
        // CART Bus monitoring
        if (cartridgeNeedsBusMonitoring) cartridge.monitorBusBeforeWrite(address, val);

        data = val;

        if ((address & TIA_MASK) === TIA_SELECT) tia.write(address, val);
        else if ((address & RAM_MASK) === RAM_SELECT) ram.write(address, val);
        else if ((address & PIA_MASK) === PIA_SELECT) pia.write(address, val);
        else if (cartridge) cartridge.write(address, val);
    };


    var cpu;
    var tia;
    var pia;
    var ram;
    var cartridge;
    var cartridgeNeedsBusMonitoring = false;

    var data = 0;


    var CART_MASK = 0x1000;
    var CART_SELECT = 0x1000;
    var RAM_MASK = 0x1280;
    var RAM_SELECT = 0x0080;
    var TIA_MASK = 0x1080;
    var TIA_SELECT = 0x0000;
    var PIA_MASK = 0x1280;
    var PIA_SELECT = 0x0280;


    init(this);

};
