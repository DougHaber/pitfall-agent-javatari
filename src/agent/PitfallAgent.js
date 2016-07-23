"use strict";

function PitfallAgent(atariConsole) {
    var self = this;


    /********************************************************************************
     * Settings
     ********************************************************************************/

    // This section defines the various settings used by the algorithm to determine
    // the limits and odds of random behaviors.

    // The times are based off of thousands of clock ticks.   There are roughly a million
    // ticks per second when running at normal speed.  It is generally close enough to think
    // of the durations as being in something close to milliseconds.

    // Settings only have an effect when training.  When playing back recorded commands,
    // the states are used as recorded.

    var settings = {
        // Allow command variations to be repeated this many times without progressing
        // to a further position.
        numResetsWithoutProgress: 20,

        // How long to hold down a single press button or control before releasing.
        // Used for the jump and down buttons.
        buttonHoldDuration: 50,

	// After a reset, we wait a random number between 0 and resetNextCommandDelay cycles
	// before executing our next command.
	resetNextCommandDelay: 800,

        // ** Behavior Times **

        // When choosing a new behavior, these time values define the limits
        // For behavior 'Type' the minTypeDuration is the minimum wait before another behavior.
        // The randomTypeDuration is the random number of extra cycles waited. (0 to n - 1)
        //
        // For example, if min is 100 and random is 1000, that means the wait will be
        // between 100 and 1099 thousand cycles.  (100 + Math.random() * 1000)
        // Used numbers are truncated.
        minRightDuration: 100, // The delay after starting to move right
        randomRightDuration: 700,
        minStopDuration: 200, // Stop means hold the controller in the center (stop moving right)
        randomStopDuration: 1000,
        minDownDuration: 200, // Down is the amount of wait after releasing a vine
        randomDownDuration: 300,
        minJumpDuration: 554, // The wait for a Jump. (Jumps take about 554000 cycles.  This must be higher.)
        randomJumpDuration: 200,
        minNOOPDuration: 100,  // NOOP means extending the current state with no changes
        randomNOOPDuration: 2000,
        minReleaseVineDuration: 600, // This is the amount of wait when on a vine before releasing
        randomReleaseVineDuration: 5000,

        // ** Odds of Behaviors (as percentages) **

        chanceOfNoChange: 0.15, // The chance of not altering the current controls
        // Otherwise, if we are on a vine we automatically schedule our releaseVineDuration
        chanceOfRight: 0.7, // Otherwise, if stopped, the chance of starting to move right
        chanceOfStop: 0.15 // Otherwise, if going right, the chance of stopping
        // Otherwise, we jump.  When stationary, the jump is straight up, otherwise it is to the right.
    };


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
            this.nextCommandCycle = nextCommandCycle || cpuCycle +
                (settings.minRightDuration + Math.random() * settings.randomRightDuration) * 1000;
        }
        else if (commandName == 'stop') {
            this.nextCommandCycle = nextCommandCycle || cpuCycle +
                (settings.minStopDuration + Math.random() * settings.randomStopDuration) * 1000;
        }
        else if (commandName == 'down') { // Release vine
            this.scheduleCommand(cpuCycle + settings.buttonHoldDuration * 1000, 'downRelease', commandGroup);
            this.nextCommandCycle = nextCommandCycle || cpuCycle +
                (settings.minDownDuration + Math.random() * settings.randomDownDuration) * 1000;
        }
        else if (commandName == 'jump') {
            this.scheduleCommand(cpuCycle + settings.buttonHoldDuration * 1000, 'jumpRelease', commandGroup);
            this.nextCommandCycle = nextCommandCycle || cpuCycle +
                (settings.minJumpDuration + Math.random() * settings.randomJumpDuration) * 1000;
        }
        else if (commandName == 'noop') {
            this.nextCommandCycle = nextCommandCycle || cpuCycle +
                (settings.minNOOPDuration + Math.random() * settings.randomNOOPDuration) * 1000;
        }

        return this.commands[this.commands.length - 1];
    };


    this.chooseNextCommand = function(cpuCycle) {
        // Randomly pick the next command to run

        if (Math.random() <= settings.chanceOfNoChange) { // Stay unchanged for a little longer
            this.scheduleCommand(cpuCycle, 'noop');
        }
        else if (this.isPlayerOnVine()) {
            this.scheduleCommand(cpuCycle +
                                 (settings.minReleaseVineDuration +
                                  Math.random() * settings.randomReleaseVineDuration) * 1000, 'down');
        }
        else if (! this.controlStates.right && Math.random() <= settings.chanceOfRight) {
            // If we aren't going right, go right
            this.scheduleCommand(cpuCycle, 'right');
        }
        else if (this.controlStates.right && Math.random() <= settings.chanceOfStop) {
            // If we are going right, stop
            this.scheduleCommand(cpuCycle, 'stop');
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
        else if (commandName == 'stop')         { this.pressRight(false);  }
        else if (commandName == 'jump')         { this.pressButton(true);  }
        else if (commandName == 'jumpRelease')  { this.pressButton(false); }
        else if (commandName == 'down')         { this.pressDown(true);    }
        else if (commandName == 'downRelease')  { this.pressDown(false);   }

        if (! currentCommand.worldPosition) {
            currentCommand.worldPosition = this.screenNumber * 10 + this.getXPosition();
        }

        currentCommand.execCounter++;
    };


    this.getMostRecentCheckPoint = function(screenNumber) {
        // Return the most recent checkpoint command in the history
        var commands = this.commands;
        var x;

        for (x = commands.length - 1; x > 1; x--) {
            if (commands[x].checkPoint) {
                return commands[x];
            }
        }

        return undefined;
    };


    this.getCheckPointForScreen = function(screenNumber) {
        // Return the checkpoint command associated with a screenNumber
        var commands = this.commands;
        var worldPosition = screenNumber * 10;
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
        var screenCheckPoint;
        var tmp;

        this.cpuCycle = cpuCycle;

        if (this.updateAndCheckState()) {
            return;
        }

        if (this.getScreenId() != this.currentScreenId) {
            this.screenNumber++;
            this.currentScreenId = this.getScreenId();
            this.log(1, "* Entering screen %o  (id=%o)", this.screenNumber, this.currentScreenId);

            if (this.quickTrainMode) {
                // If we don't have a saved store or if we do, but this one is further along
                if (! this.savedAgentState || this.screenNumber * 10 > this.savedAgentState.commandObject.worldPosition) {
                    // If our last command was for this checkpoint or there is no checkpoint command
                    screenCheckPoint = this.getCheckPointForScreen(this.screenNumber);

                    if (! screenCheckPoint || screenCheckPoint == this.getMostRecentCheckPoint()) {
                        tmp = commands.splice(this.currentCommandIndex);
                        command = this.scheduleCommand(this.cpuCycle, 'noop', undefined, 0);
                        command.worldPosition = this.screenNumber * 10;
                        this.commands = commands.concat(tmp);
                        this.saveState(command);
                    }
                }
            }
        }
    };


    this.pulse = function(cpuCycle) {
        // Called every time the CPU pulses
        // This is used for injecting input
        var currentCommand = this.commands[this.currentCommandIndex];

        this.cpuCycle = cpuCycle;

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
        // Player y position is stored in e9.  On the ground, the player is at 32..
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
            commands.splice(this.currentCommandIndex + 1);
            this.pruneCommandGroup(commands[this.currentCommandIndex].commandGroup);
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

        if (this.numResetsWithoutProgress >= settings.numResetsWithoutProgress) {
            while (commands[commands.length - 1].worldPosition >= currentWorldPosition - 1 &&
                   ! commands[commands.length - 1].checkPoint) {
                this.pruneCommandGroup(commands[commands.length - 1].commandGroup);
            }

            this.numResetsWithoutProgress = 0;
        }

        this.lastRunMaxWorldPosition = currentWorldPosition;
    };


    this.reset = function(doNotPruneHistory) {
        // Reset the CPU and wait 100ms for the game to load
        var quickTrain = this.quickTrainMode;

        this.inGame = false;

        if (! doNotPruneHistory) {
            this.pruneCommands();
        }

        this.numResets++;

        this.clearAllControls(); // Stop pressing on the controls

        if (! (quickTrain && this.loadState())) {
            this.cpu.reset();
        }

        this.log(1, "* RESET numResets=%o, retriesRemaining=%o, screen=%o",
                 this.numResets, settings.numResetsWithoutProgress - this.numResetsWithoutProgress, this.screenNumber);

        // After a VSYNC, start the game
        this.cpu.setPCWatchCallback(0xF66D, function() {
            self.nextCommandCycle = parseInt(self.commands[self.commands.length - 1].cycle +
					      1 + (Math.random() * settings.resetNextCommandDelay) * 1000);
            self.currentScreenId = self.getScreenId();

            if (! (quickTrain && self.savedAgentState)) { // Starting from the beginning
                self.lastScore = 2000;
                self.currentCommandIndex = 0;
                self.screenNumber = 0;
            }

            self.cpu.setPCWatchCallback(0xF66D, self.VSYNCCallbackFunction);
            self.inGame = true;
        });
    };


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
    };


    this.loadStateFromLocalStorage = function() {
        // Load the state from localStorage
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
            this.savedAgentState = undefined;

            this.reset(true);

            return true;
        }
        else {
            this.log(0, "ERROR: Failed to parse JSON from LocalStorage: No LocalStorage State");
            return false;
        }
    };


    this.saveState = function(command) {
        // Save the state
        // The passed in command object is marked as the one used to save the state, but
        // the actual state of the agent and emulator determines the settings.

        // This function is called when we arrive at a new screen.  We need all the state up
        // until this point, but none of the state after it, so we remove all other commands.
        // This may leave dangling commmands (such as a jumpRelease,) but it will clear
        // itself out.
        this.commands.splice(this.currentCommandIndex + 1);

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
            this.log(3, "No checkpointed state found.  Starting from the beginning.");
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

        this.pressRight(savedAgentState.rightControl);
        this.pressButton(savedAgentState.buttonControl);
        this.pressDown(savedAgentState.downControl);

        this.cpu.reset();

        this.atariConsole.getSavestateSocket().loadState(0);
        this.log(3, "LOAD_STATE=%O  [new index=%o]  lvl=%o", savedAgentState, this.currentCommandIndex, this.screenNumber);

        return true;
    };


    this.saveStateToFile = function() {
        // Create a downloadable JSON file of the current state in LocalStorage
        var data = new Blob([ localStorage.getItem('pitfallAgentCommands') ], { type: 'text/plain' });
        var url = window.URL.createObjectURL(data);
        var a = document.createElement('a');
        var event = document.createEvent("MouseEvents");

        a.href = url;
        a['download'] = 'pitfall-state.json';

        event.initMouseEvent("click", true, true, window,
                             0, 0, 0, 0, 0, false, false,
                             false, false, 0, null);

        if (! a.dispatchEvent(event)) {
            /* If the event processing failed, fallback */
            a.click();
        }
    };


    this.loadStateFromFile = function() {
        // Load the state from a file on the web server 'pitfall-state.json'
        var request = new XMLHttpRequest();

        request.onreadystatechange = function() {
            if (request.readyState != 4) {
                return;
            }
            else if (request.status == 200) {
                self.log(3, "loadStateFromFile(): Loaded state from file");
                localStorage.setItem('pitfallAgentCommands', request.responseText);
                self.loadStateFromLocalStorage();
            }
            else {
                self.log(0, "loadStateFromFile(): Request failed with status %o", request.status);
            }
        };

        request.open('GET', 'pitfall-state.json', true);

        request.send();
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
    };


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


    this.createButton = function(title, onClick) {
        var input = document.createElement('input');

        input.type = 'button';
        input.value = title;
        input.onclick = onClick;
        // TODO: Remove this next line:
        input.style.marginRight = '5px';

        return (input);
    };


    this.initUI = function() {
        var controlsDiv = document.createElement('div');

        controlsDiv.style.textAlign = 'center';

        // Add the checkboxes
        controlsDiv.appendChild(this.createCheckbox('Fast Speed', true, function(event) {
            self.setFastMode(event.target.checked);
        }));

        controlsDiv.appendChild(this.createCheckbox('Use Checkpoints', true, function(event) {
            self.setQuickTrainMode(event.target.checked);
        }));

        // Add the button controls
        controlsDiv.appendChild(document.createElement('br'));
        controlsDiv.appendChild(this.createButton('Reset Training', function() {
            self.commands.splice(1);
            self.commands[0].execCounter = 0;
            self.reset(true);
            self.numResets = 0;
            self.clearLocalStorage();
        }));

        controlsDiv.appendChild(this.createButton('Download State File', function() {
            self.saveStateToFile();
        }));

        controlsDiv.appendChild(this.createButton('Load pitfall-state.json', function() {
            self.loadStateFromFile();
        }));

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
            this.reset(true);
        }
    };


    this.init();

    // Set a global to make this accessible from the console for debugging
    window['pitfallAgent'] = this;
}
