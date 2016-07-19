"use strict";

function PitfallAgent(atariConsole) {
    var self = this;


    /********************************************************************************
     * Agent Logic and Controls
     ********************************************************************************/

    this.scheduleCommand = function(cpuCycle, commandName, commandGroup, nextCommandCycle) {
	// commandGroup provides a unique identifier for a group of commands that occur together
	// nextCommandCycle determines the next cycle that a command will be scheduled for
	var offset;

	commandGroup = commandGroup || this.nextCommandGroup++;

	this.commands.push({
	    cycle: parseInt(cpuCycle),
	    commandName: commandName,
	    worldPosition: undefined, // The world position when first executed
	    execCounter: 0, // Number of executions
	    checkPoint: false,
	    commandGroup: commandGroup
	});

	// Add any extra actions needed by the command
	if (commandName == 'right') {
	    this.nextCommandCycle = nextCommandCycle || cpuCycle + (50 + Math.random() * 300) * 1000;
	}
	else if (commandName == 'rightRelease') { // Stop and wait
	    this.nextCommandCycle = nextCommandCycle || cpuCycle + (200 + Math.random() * 1000) * 1000;
	}
	else if (commandName == 'down') { // Release vine
	    this.scheduleCommand(cpuCycle + 50000, 'downRelease', commandGroup);
	    this.nextCommandCycle = nextCommandCycle || cpuCycle + (200 + Math.random() * 300) * 1000;
	}
	else if (commandName == 'jump') {
	    this.scheduleCommand(cpuCycle + 50000, 'jumpRelease', commandGroup);
	    this.nextCommandCycle = nextCommandCycle || cpuCycle + (700 + Math.random() * 200) * 1000;
	}
	else if (commandName == 'noop') {
	    this.nextCommandCycle = nextCommandCycle || cpuCycle + (200 + Math.random() * 3000) * 1000;
	}

	return this.commands[this.commands.length - 1];
    };


    this.chooseNextCommand = function(cpuCycle) {
	// Randomly pick the next command to run

	if (Math.random() > 0.9) { // Stay unchanged for a little longer
	    this.scheduleCommand(cpuCycle, 'noop');
	}
	else if (this.isPlayerOnVine()) {
	    this.scheduleCommand(cpuCycle + (200 + Math.random() * 10000) * 1000, 'down');
	}
	else if (! this.controlStates.right && Math.random() > 0.5) { // If we aren't going right, go right
	    this.scheduleCommand(cpuCycle, 'right');
	}
	else if (this.controlStates.right && Math.random() > 0.9) { // Stop
	    this.scheduleCommand(cpuCycle, 'rightRelease');
	}
	else {
	    this.scheduleCommand(cpuCycle, 'jump');
	}
    };


    this.updateAndCheckState = function() {
        // Update the game state.
        //    Update tracking of the currentScore
        //    Check if the game needs to be reset, and if so reset and return true
	var currentScore = this.getScore();

    	if (currentScore < this.lastScore || ! this.isPlayerAboveGround()) {
            this.reset();

	    return true;
	}

        this.lastScore = currentScore;

        return false;
    };


    this.executeCommand = function() {
	// Execute the current command
	var currentCommand = this.commands[this.currentCommandIndex++];
	var commandName = currentCommand.commandName;

	this.log(5, "[%o, commandIndex=%o, worldPos=%o] %o, drift=%o  [execCounter=%o] %s",
		    currentCommand.commandGroup,
		    this.currentCommandIndex, this.getXPosition() + this.screenNumber * 10,
		    commandName, this.cpuCycle - currentCommand.cycle, currentCommand.execCounter,
		    currentCommand.checkPoint ? 'CheckPoint' : '');

	if (commandName == 'right')             { this.pressRight(true);   }
	else if (commandName == 'rightRelease') { this.pressRight(false);  }
	else if (commandName == 'jump')         { this.pressButton(true);  }
	else if (commandName == 'jumpRelease')  { this.pressButton(false); }
	else if (commandName == 'down')         { this.pressDown(true);    }
	else if (commandName == 'downRelease')  { this.pressDown(false);   }

	if (! currentCommand.worldPosition) {
	    currentCommand.worldPosition = this.screenNumber * 10 + this.getXPosition();
	}

	currentCommand.execCounter++;
    };


    this.getCheckPointForScreen = function(screenId) {
	// Return the checkpoint command associated with a screenId
	var commands = this.commands;
	var worldPosition = screenId * 10 + 1;
	var x;

	for (x = commands.length - 1; x > 1; x--) {
	    if (commands[x].checkPoint && commands[x].worldPosition == worldPosition) {
		return commands[x];
	    }
	    else if (commands[x].worldPosition < worldPosition) {
		break;
	    }
	}

	return undefined;
    };


    this.onVSYNC = function(cpuCycle) {
	// Called every time a VSYNC occurs
	// This is used for checking game state
	var commands = this.commands;
	var command;
	var tmp;

	this.cpuCycle = cpuCycle + this.baseCPUTimeAdjust;

	if (this.updateAndCheckState()) {
	    return;
	}

	if (this.getScreenId() != this.currentScreenId) {
	    this.screenNumber++;
	    self.currentScreenId = self.getScreenId();

	    if (this.quickTrainMode) {
		// If we don't have a saved store or if we do, but this one is further along
		if (! this.savedAgentState || this.screenNumber * 10 > this.savedAgentState.commandObject.worldPosition) {
		    command = this.getCheckPointForScreen(this.screenNumber);

		    if (! command) {
			tmp = commands.splice(this.currentCommandIndex);
			command = this.scheduleCommand(this.cpuCycle, 'noop', undefined, 0);
			command.worldPosition = this.screenNumber * 10;
			this.commands = commands.concat(tmp);
		    }

		    this.saveState(command);
		}
	    }
	}
    };


    this.pulse = function(cpuCycle) {
	// Called every time the CPU pulses
	// This is used for injecting input
	var currentCommand = this.commands[this.currentCommandIndex];

	this.cpuCycle = cpuCycle + this.baseCPUTimeAdjust;

	if (currentCommand) {
	    if (currentCommand.cycle <= this.cpuCycle) { // Send the next prepared command
		this.executeCommand();
	    }
	}
        else if (this.cpuCycle >= this.nextCommandCycle) { // Start a new command
	    this.chooseNextCommand(this.cpuCycle + 1);
	}
    };


    /********************************************************************************
     * Game State Access
     ********************************************************************************/

    this.getScore = function() {
	// The score is stored in d6 & d7 as decimal values in hex.
	// The first 2 digits come from d6, and the second 2 from d7
	var firstTwoDigits = this.ram.read(0xd6).toString(16);
	var lastTwoDigits = this.ram.read(0xd7).toString(16);

	if (firstTwoDigits == '0') {
	    return (lastTwoDigits);
	}
	else if (lastTwoDigits.length == 1) {
	    lastTwoDigits = "0" + lastTwoDigits;
	}

	return (parseInt(firstTwoDigits + lastTwoDigits));
    };


    this.getXPosition = function () {
	// Return an X position for the player
	// Really, it is a number from 0 to 9 that seems to indicate
	// which slice the player is in horizontally on the screen
	return (this.ram.read(0x98));
    };


    this.getScreenId = function () {
	// Return the unique id for the current screen
	// (Taking from 0x81, which I'm not certain is correct)
	return (this.ram.read(0x81));
    };


    this.isPlayerAboveGround = function() {
	// Player y position is stored in e9.  32 is ground screenNumber.
	// Check if the player is below ground height, and if not fail.
	return (this.ram.read(0xe9) <= 32);
    };


    this.isPlayerJumping = function() {
        // If the player's Y position is greater than 32 and they aren't on a vine,
        // then assume they are jumping
	return (this.ram.read(0xe9) < 32 && ! this.isPlayerOnVine());
    };


    this.isPlayerOnVine = function() {
	// Return true if the player is hanging from a vine
	// This is set via the flag in EA
	return (this.ram.read(0xea) == 1);
    };


    /********************************************************************************
     * Game Controls
     ********************************************************************************/

    this.pressRight = function(pressed) {
	// Press or release the right arrow
	this.controls.processKeyEvent(39, pressed, 0);
	this.controlStates.right = pressed;
    };


    this.pressDown = function(pressed) {
	// Press the down key and release it to drop from Vines
	this.controls.processKeyEvent(40, pressed, 0);
	this.controlStates.down = pressed;
    };


    this.pressButton = function(pressed) {
	// Jump by pressing the spacebar, and then releasing shortly after
	this.controls.processKeyEvent(32, pressed, 0);
	this.controlStates.button = pressed;
    };


    this.clearAllControls = function() {
	// Release all the controls
	this.pressRight(false);
	this.pressButton(false);
	this.pressDown(false);
    };


    /********************************************************************************
     * State Resets
     ********************************************************************************/

    this.pruneCommandGroup = function(targetCommandGroup) {
	// Remove a target command group from the end of the list
	var commands = this.commands;
	var x;

	for (x = commands.length - 1; x > 0 && ! commands[x].checkPoint; x--) {
	    if (commands[x].commandGroup != targetCommandGroup) {
		return;
	    }
	    else {
		commands.pop();
	    }
	}
    };


    this.pruneCommands = function() {
	// After a reset, remove some history so that something different is tried on the next run
	var commands = this.commands;
	var currentWorldPosition;

	// Remove the current commands group and beyond
	// This cleans any dangling parts (such as jump/jumpRelease) and unexecuted commands
	if (this.currentCommandIndex && commands[this.currentCommandIndex]) {
	    this.pruneCommandGroup(commands[this.currentCommandIndex].commandGroup);
	    commands.splice(this.currentCommandIndex);
	}

	currentWorldPosition = commands[commands.length - 1].worldPosition;

	// Remove the most recently added commandGroup
	this.pruneCommandGroup(commands[commands.length - 1].commandGroup);

	// If we aren't making progress, remove all commandGroups within the last 2 worldPositions.
	// Do not remove past a checkpoint.
	if (currentWorldPosition <= this.lastRunMaxWorldPosition) {
	    this.numResetsWithoutProgress++;
	}
	else {
	    this.numResetsWithoutProgress = 0;
	}

	if (this.numResetsWithoutProgress >= 20) {
	    while (commands[commands.length - 1].worldPosition >= currentWorldPosition - 1 &&
		   ! commands[commands.length - 1].checkPoint) {
		this.pruneCommandGroup(commands[commands.length - 1].commandGroup);
	    }

	    this.numResetsWithoutProgress = 0;
	}

	this.lastRunMaxWorldPosition = currentWorldPosition;
    };


    this.reset = function() {
        // Reset the CPU and wait 100ms for the game to load
	var quickTrain = this.quickTrainMode;

	this.inGame = false;
        this.pruneCommands();

	this.numResets++;

	this.clearAllControls(); // Stop pressing on the controls

	if (! (quickTrain && this.loadState())) {
            this.cpu.reset();
	}

	this.log(1, "* RESET numResets=%o, retriesRemaining=%o", this.numResets, 20 - this.numResetsWithoutProgress);

	// After a VSYNC, start the game
	this.cpu.setPCWatchCallback(0xF66D, function() {
	    self.nextCommandCycle = Math.round(self.commands[self.commands.length - 1].cycle + 1 + Math.random() * 500);
	    self.currentScreenId = self.getScreenId();

	    if (! (quickTrain && self.savedAgentState)) { // Starting from the beginning
		self.lastScore = 2000;
		self.currentCommandIndex = 0;
		self.screenNumber = 0;
		self.baseCPUTimeAdjust = 0;
		self.resetNum = this.numResets;
	    }


	    self.cpu.setPCWatchCallback(0xF66D, self.VSYNCCallbackFunction);
	    self.inGame = true;
	});
    }


    /********************************************************************************
     * State Management
     ********************************************************************************/

    this.clearLocalStorage = function() {
	localStorage.removeItem('pitfallAgentCommands');
    };


    this.saveStateToLocalStorage = function() {
	// Save the commands[] into localStorage
	// This saves it raw.  If needed, we can reduce size by removing
	// unimpactful commands and debug vars.  We also probably shouldn't save non-executed
	// commands.
	localStorage.setItem('pitfallAgentCommands', JSON.stringify({
	    commands: this.commands,
	    savedAgentState: this.savedAgentState, // For debugging
	    numResets: this.numResets
	}));
    }


    this.loadStateFromLocalStorage = function() {
	// Save the commands[] into localStorage
	// This saves it raw.  If needed, we can reduce size by removing
	// noops and debug vars.
	var storedJSON = localStorage.getItem('pitfallAgentCommands')
	var data;
	var error;

	if (storedJSON) {
	    try {
		data = JSON.parse(storedJSON);
	    }
	    catch (error) {
		this.log(0, "ERROR: Failed to parse JSON from LocalStorage: %o", error);
		return false;
	    }

	    this.commands = data.commands;
	    this.numResets = data.numResets;

	    this.reset();

	    return true;
	}
	else {
	    return false;
	}
    }


    this.saveState = function(command) {
	// Save the state
	//  The past in command object is marked as the one used to save the state, but
	//  the actual state of the agent and emulator determines the settings.
	this.savedAgentState = {
	    lastScore: this.lastScore,
	    currentCommandIndex: this.currentCommandIndex,
	    screenNumber: this.screenNumber,
	    commandObject: command,
	    cpuCycle: command.cycle,
	    buttonControl: this.controlStates.button,
	    rightControl: this.controlStates.right,
	    downControl: this.controlStates.down
	};

	this.atariConsole.getSavestateSocket().saveState(0);
	command.checkPoint = true;
	this.saveStateToLocalStorage();
	this.log(3, "SAVE_STATE=%O  [index=%o]   lvl=%o", this.savedAgentState, this.currentCommandIndex, this.screenNumber);
    };


    this.loadState = function() {
	// Load the save state from the emulator
	var savedAgentState = this.savedAgentState;

	if (! savedAgentState) {
	    this.log(3, "NO STATE TO LOAD");
	    return false;
	}

	if (! this.commands[savedAgentState.currentCommandIndex - 1]) {
	    this.log(3, "STATE NO LONGER EXISTS [index=%o, commands=%O]", savedAgentState.commandIndex, this.commands);
	    this.savedAgentState = undefined;
	    return false;
	}

	this.lastScore = savedAgentState.lastScore;
	this.currentCommandIndex = savedAgentState.currentCommandIndex;
	this.screenNumber = savedAgentState.screenNumber;

	this.baseCPUTimeAdjust = savedAgentState.cpuCycle;

	this.pressRight(savedAgentState.rightControl);
	this.pressButton(savedAgentState.buttonControl);
	this.pressDown(savedAgentState.downControl);

	this.cpu.reset();
	this.atariConsole.getSavestateSocket().loadState(0);
	this.log(3, "LOAD_STATE=%O  [new index=%o]  lvl=%o", savedAgentState, this.currentCommandIndex, this.screenNumber);
	return true;
    };


    /********************************************************************************
     * Agent Interfaces
     ********************************************************************************/

    this.setFastMode = function(enabled) {
	if (enabled) {
	    this.atariConsole.mainClockAdjustToFast();
	}
	else {
	    this.atariConsole.mainClockAdjustToNormal();
	}
    }


    this.setQuickTrainMode = function(enabled) {
	this.quickTrainMode = enabled;

	if (! enabled) {
	    this.savedAgentState = undefined;
	}
    };


    /********************************************************************************
     * User Interface
     ********************************************************************************/

    this.createCheckbox = function(title, checked, callback) {
	var wrapper = document.createElement('span');
	var input = document.createElement('input');
	var text = document.createElement('span');

	text.innerHTML = title;
	input.type = 'checkbox';
	input.checked = checked;
	input.onchange = callback;

	wrapper.appendChild(input);
	wrapper.appendChild(text);

	return (wrapper);
    };


    this.initUI = function() {
	var controlsDiv = document.createElement('div');
	var clearStorageButton = document.createElement('input');

	controlsDiv.style.textAlign = 'center';

	// Add the checkboxes
	controlsDiv.appendChild(this.createCheckbox('Fast Speed', true, function(event) {
	    self.setFastMode(event.target.checked);
	}));

	controlsDiv.appendChild(this.createCheckbox('Use Checkpoints', true, function() {
	    self.setQuickTrainMode(event.target.checked);
	}));

	// Add a button for clearing the storage
	controlsDiv.appendChild(document.createElement('br'));
	clearStorageButton.type = 'button';
	clearStorageButton.value = 'Reset Training';
	clearStorageButton.onclick = function() {
	    self.commands.splice(1);
	    self.reset();
	    self.numResets = 0;
	    self.clearLocalStorage();
	};
	controlsDiv.appendChild(clearStorageButton);

	Javatari.screenElement.parentNode.appendChild(controlsDiv);
    };


    /********************************************************************************
     * Logging
     ********************************************************************************/

    this.setLogLevel = function(level) {
	this.logLevel = level;
    };


    this.log = function(level) {
	var argumentsArray = Array.prototype.slice.call(arguments); // Convert 'arguments' to an Array

	if (level <= this.logLevel) {
	    argumentsArray.shift(); // Remove the 'level' argument
	    console.log.apply(console, argumentsArray);
	}
    };


    /********************************************************************************
     * Initialization
     ********************************************************************************/

    this.init = function() {
	this.inGame = false; // True when we are playing, false when we are loading/resetting
	this.logLevel = 1; // Amount of detail to show (0=error, 1=basic, 3=state, 5=command)

	// Resets - The number of times the game state has been moved back
	this.numResets = -1; // Start at -1, since reset() is called to begin
	this.numResetsWithoutProgress = 0;

	this.lastRunMaxWorldPosition = 1; // The maxWorldPosition at the end of the last run
	this.cpuCycle = undefined;
	this.baseCPUTimeAdjust = 0; // When using saved states, set the starting clock
    	this.lastScore = 2000;

	// Commands is an array of hashes containing commands and the state at time of execution
	this.commands = [];
	this.currentCommandIndex = 0; // The index in the array of the next active command
	this.nextCommandCycle = undefined; // Don't allow another command until this clock cycle
	this.nextCommandGroup = 1; // Id used to identify groups of commands added together

	this.screenNumber = 0; // Which screen we are on.  Starting at 0, each screen to the right increments 1.
	this.currentScreenId = undefined; // Screen Id, as found in the game's RAM

	this.quickTrainMode = false; // When enabled load state from a the beginning of a screen on reset
	this.savedAgentState = undefined; // Store information about our state at the time of a state save

	this.controlStates = {
	    button: false,
	    right: false,
	    down: false
	};

	// Create helpers for accessing Javatari's APIs
	this.atariConsole = atariConsole;
	this.controls = Javatari.room.controls;
	this.ram = atariConsole.getRAM();
	this.cpu = atariConsole.getCPU();
	this.bus = atariConsole.getBus();

	// Register a handler so that we get called every clock tick and can inject our commands
        this.cpu.onClockPulse = function(cpuCycle) {
	    self.inGame && self.pulse(cpuCycle);
        };

	// Every time there is a VSYNC, call this to update the state
	this.VSYNCCallbackFunction = function(cpuCycle) {
	    self.inGame && self.onVSYNC(cpuCycle);
        };

	this.initUI();
	this.setFastMode(true);
	this.setQuickTrainMode(true);

	// Either load the last trained state from localStorage, or start by going right
	if (! this.loadStateFromLocalStorage()) {
	    this.scheduleCommand(500000, 'right');
	    this.reset();
	}
    };


    this.init();

    // Set a global to make this accessible from the console for debugging
    window['pitfallAgent'] = this;
}
