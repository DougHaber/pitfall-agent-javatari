// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

jt.Ram = function() {

    function init() {
        // RAM comes totally random at creation

        for (var i = bytes.length - 1; i >= 0; i--) {
	    // bytes[i] = (Math.random() * 256) | 0;
            // Pitfall-agent: Replace the random value with 0 to keep things deterministic.
            bytes[i] = 0;
        }
    }

    this.powerOn = function() {
    };

    this.powerOff = function() {
    };

    this.read = function(address) {
        return bytes[address & ADDRESS_MASK];
    };

    this.write = function(address, val) {
        bytes[address & ADDRESS_MASK] = val;
    };

    this.powerFry = function() {
	// Pitfall-agent: Disable frying to keep everything deterministic
        // Instead of frying, set everything to 0
        for (var i = bytes.length - 1; i >= 0; i--) {
            bytes[i] = 0;
	}
    };


    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            'b': btoa(jt.Util.uInt8ArrayToByteString(bytes))
        };
    };

    this.loadState = function(state) {
        bytes = jt.Util.byteStringToUInt8Array(atob(state['b']));
    };


    // Variables  -------------------------------------------

    var bytes = new Array(128);

    var ADDRESS_MASK = 0x007f;

    var FRY_ZERO_BITS = 120;        // Quantity of bits to change
    var FRY_ONE_BITS = 25;
    var FRY_VARIANCE = 0.3;


    init();

};
