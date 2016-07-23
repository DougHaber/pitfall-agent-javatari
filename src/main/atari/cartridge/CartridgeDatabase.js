// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

jt.CartridgeDatabase = function() {

    this.createCartridgeFromRom = function(rom) {
        // Try to build the Cartridge if a supported format is found
        var options = getFormatOptions(rom);
        if (options.length === 0) return;

        // Choose the best option
        var bestOption = options[0];
        jt.Util.log("" + bestOption.name + ": " + bestOption.desc + ", priority: " + bestOption.priority + (bestOption.priorityBoosted ? " (" + bestOption.priorityBoosted + ")" : ""));
        return bestOption.createCartridgeFromRom(rom);
    };

    this.createCartridgeFromSaveState = function(saveState) {
        var cartridgeFormat = jt.CartridgeFormats[saveState['f']];
        if (!cartridgeFormat) {
            var ex = new Error ("Unsupported ROM Format: " + saveState['f']);
            ex.javatari = true;
            throw ex;
        }
        return cartridgeFormat.createCartridgeFromSaveState(saveState);
    };

    this.produceInfo = function(rom) {
        // Preserve original length as MD5 computation may increase it
        var origLen = rom.content.length;
        var hash = jt.MD5(rom.content);
        if (rom.content.length > origLen) rom.content.splice(origLen);

        // Get info from the library
        var info = jt.CartridgeInfoLibrary[hash];
        if (info) {
            jt.Util.log("" + info.n);
        } else {
            info = buildInfo(rom.source);
            jt.Util.log("Unknown ROM: " + info.n);
        }

        finishInfo(info, rom.source, hash);
        return info;
    };

    var getFormatOptions = function(rom) {
        var formatOptions = [];
        var formatOption;
        var denialEx;
        for (var format in jt.CartridgeFormats) {
            try {
                formatOption = jt.CartridgeFormats[format].tryFormat(rom);
                if (!formatOption) continue;	    	    // rejected by format
                boostPriority(formatOption, rom.info);	    // adjust priority based on ROM info
                formatOptions.push(formatOption);
            } catch (ex) {
                if (!ex.formatDenial) throw ex;
                if (!denialEx) denialEx = ex;               // Keep only the first one
            }
        }

        // If no Format could be found, throw error
        if (formatOptions.length === 0) {
            var ex = denialEx || new Error ("Unsupported ROM Format. Size: " + rom.content.length);
            ex.javatari = true;
            throw ex;
        }
        // Sort according to priority
        formatOptions.sort(function formatOptionComparator(a, b) {
           return (a.priorityBoosted || a.priority) - (b.priorityBoosted || b.priority);
        });

        return formatOptions;
    };

    var buildInfo = function(romSource) {
        var info = { n: "Unknown" };
        if (!romSource || !romSource.trim()) return info;

        var name = romSource;

        // Get the last part of the URL (file name)
        var slash = name.lastIndexOf("/");
        var bslash = name.lastIndexOf("\\");
        var question = name.lastIndexOf("?");
        var i = Math.max(slash, Math.max(bslash, question));
        if (i >= 0 && i < name.length - 1) name = name.substring(i + 1);
        // Get only the file name without the extension
        var dot = name.lastIndexOf(".");
        if (dot >= 0) name = name.substring(0, dot);

        info.n = name.trim() || "Unknown";
        return info;
    };

    // Fill absent information based on ROM name
    var finishInfo = function(info, romSource, hash) {
        // Saves the hash on the info
        info.h = hash;
        // Compute label based on name
        if (!info.l) info.l = produceCartridgeLabel(info.n);
        var name = info.n.toUpperCase();
        // Adjust Paddles information if absent
        Paddles: if (!info.p) {
            info.p = 0;
            if (!name.match(HINTS_PREFIX_REGEX + "JOYSTICK(S)?" + HINTS_SUFFIX_REGEX)) {
                if (name.match(HINTS_PREFIX_REGEX + "PADDLE(S)?" + HINTS_SUFFIX_REGEX))
                    info.p = 1;
                else
                    for (var i = 0; i < PADDLES_ROM_NAMES.length; i++)
                        if (name.match(PADDLES_ROM_NAMES[i])) {
                            info.p = 1;
                            break Paddles;
                        }
            }
        }
        // Adjust CRT Mode information if absent
        CrtMode: if (!info.c) {
            if (name.match(HINTS_PREFIX_REGEX + "CRT(_|-)?MODE" + HINTS_SUFFIX_REGEX))
                info.c = 1;
            else
                for (i = 0; i < CRT_MODE_ROM_NAMES.length; i++)
                    if (name.match(CRT_MODE_ROM_NAMES[i])) {
                        info.c = 1;
                        break CrtMode;
                    }
        }
        // Adjust Format information if absent
        Format: if (!info.f) {
            // First by explicit format hint
            var romURL = romSource.toUpperCase();
            for (var formatName in jt.CartridgeFormats)
                if (formatMatchesByHint(formatName, name) || formatMatchesByHint(formatName, romURL)) {
                    info.f = formatName;
                    break Format;
                }
            // Then by name
            for (formatName in FORMAT_ROM_NAMES)
                if (formatMatchesByName(formatName, name)) {
                    info.f = formatName;
                    break Format;
                }
        }
    };

    var boostPriority = function(formatOption, info) {
        if (info.f && formatOption.name === info.f)
            formatOption.priorityBoosted = formatOption.priority - FORMAT_PRIORITY_BOOST;
        else
            formatOption.priorityBoosted = undefined;
    };

    var produceCartridgeLabel = function(name) {
        return name.split(/(\(|\[)/)[0].trim();   //  .toUpperCase();   // TODO Validade
    };

    var formatMatchesByHint = function(formatName, hint) {
        return hint.match(HINTS_PREFIX_REGEX + formatName + HINTS_SUFFIX_REGEX);
    };

    var formatMatchesByName = function(formatName, name) {
        var namesForFormat = FORMAT_ROM_NAMES[formatName];
        if (!namesForFormat) return false;
        for (var i = 0; i < namesForFormat.length; i++)
            if (name.match(namesForFormat[i]))
                return true;
        return false;
    };


    var FORMAT_ROM_NAMES = {
        "E0": [
            "^.*MONTEZUMA.*$",						"^.*MONTZREV.*$",
            "^.*GYRUS.*$",
            "^.*TOOTH.*PROTECTORS.*$",				"^.*TOOTHPRO.*$",
            "^.*DEATH.*STAR.*BATTLE.*$",			"^.*DETHSTAR.*$",
            "^.*JAMES.*BOND.*$",					"^.*JAMEBOND.*$",
            "^.*SUPER.*COBRA.*$",					"^.*SPRCOBRA.*$",
            "^.*TUTANKHAM.*$",						"^.*TUTANK.*$",
            "^.*POPEYE.*$",
            "^.*(SW|STAR.?WARS).*ARCADE.*GAME.*$",	"^.*SWARCADE.*$",
            "^.*Q.*BERT.*QUBES.*$",					"^.*QBRTQUBE.*$",
            "^.*FROGGER.?(2|II).*$",
            "^.*DO.*CASTLE.*$"
        ],
        "FE": [
            "^.*ROBOT.*TANK.*$",		"^.*ROBOTANK.*$",
            "^.*DECATHLON.*$"	, 		"^.*DECATHLN.*$"		// There is also a 16K F6 version
        ],
        "E7": [
            "^.*BUMP.*JUMP.*$",			"^.*BNJ.*$",
            "^.*BURGER.*TIME.*$",		"^.*BURGTIME.*$",
            "^.*POWER.*HE.?MAN.*$",		"^.*HE_MAN.*$"
        ],
        "3F": [
            "^.*POLARIS.*$",
            "^.*RIVER.*PATROL.*$",		 "^.*RIVERP.*$",
            "^.*SPRINGER.*$",
            "^.*MINER.*2049.*$",		 "^.*MNR2049R.*$",
            "^.*MINER.*2049.*VOLUME.*$", "^.*MINRVOL2.*$",
            "^.*ESPIAL.*$",
            "^.*ANDREW.*DAVIE.*$",       "^.*DEMO.*IMAGE.*AD.*$" 		// Various 32K Image demos
        ],
        "3E": [
            "^.*BOULDER.*DASH.*$", 		 "^.*BLDRDASH.*$"
        ],
        "DPCa": [
            "^.*PITFALL.*(2|II).*$"
        ]
    };

    var PADDLES_ROM_NAMES = [
        "^.*PADDLES.*$",										// Generic hint
        "^.*BREAKOUT.*$",
        "^.*SUPER.*BREAKOUT.*$",		  "^.*SUPERB.*$",
        "^.*WARLORDS.*$",
        "^.*STEEPLE.*CHASE.*$",			  "^.*STEPLCHS.*$",
        "^.*VIDEO.*OLYMPICS.*$",		  "^.*VID(|_)OLYM(|P).*$",
        "^.*CIRCUS.*ATARI.*$", 			  "^.*CIRCATRI.*$",
        "^.*KABOOM.*$",
        "^.*BUGS((?!BUNNY).)*",								// Bugs, but not Bugs Bunny!
        "^.*BACHELOR.*PARTY.*$", 		  "^.*BACHELOR.*$",
        "^.*BACHELORETTE.*PARTY.*$", 	  "^.*BACHLRTT.*$",
        "^.*BEAT.*EM.*EAT.*EM.*$", 		  "^.*BEATEM.*$",
        "^.*PHILLY.*FLASHER.*$",	 	  "^.*PHILLY.*$",
        "^.*JEDI.*ARENA.*$",			  "^.*JEDIAREN.*$",
        "^.*EGGOMANIA.*$",				  "^.*EGGOMANA.*$",
        "^.*PICNIC.*$",
        "^.*PIECE.*O.*CAKE.*$",			  "^.*PIECECKE.*$",
        "^.*BACKGAMMON.*$", 			  "^.*BACKGAM.*$",
        "^.*BLACKJACK.*$",				  "^.*BLACK(|_)J.*$",
        "^.*CANYON.*BOMBER.*$", 		  "^.*CANYONB.*$",
        "^.*CASINO.*$",
        "^.*DEMONS.*DIAMONDS.*$",	      "^.*DEMONDIM.*$",
        "^.*DUKES.*HAZZARD.*2.*$",    	  "^.*STUNT.?2.*$",
        "^.*ENCOUNTER.*L.?5.*$", 		  "^.*ENCONTL5.*$",
        "^.*G.*I.*JOE.*COBRA.*STRIKE.*$", "^.*GIJOE.*$",
        "^.*GUARDIAN.*$",
        "^.*MARBLE.*CRAZE.*$",			  "^.*MARBCRAZ.*$",
        "^.*MEDIEVAL.*MAYHEM.*$",
        "^.*MONDO.*PONG.*$",
        "^.*NIGHT.*DRIVER.*$",			  "^.*NIGHTDRV.*$",
        "^.*PARTY.*MIX.*$",
        "^.*POKER.*PLUS.*$",
        "^.*PONG.*SPORTS.*$",
        "^.*SCSICIDE.*$",
        "^.*SECRET.*AGENT.*$",
        "^.*SOLAR.*STORM.*$", 			  "^.*SOLRSTRM.*$",
        "^.*SPEEDWAY.*$",
        "^.*STREET.*RACER.*$", 			  "^.*STRTRACE.*$",
        "^.*STUNT.*CYCLE.*$", 			  "^.*STUNT.?1.*$",
        "^.*TAC.?SCAN.*$",
        "^.*MUSIC.*MACHINE.*$", 		  "^.*MUSCMACH.*$",
        "^.*VONG.*$",
        "^.*WARPLOCK.*$"
    ];

    var CRT_MODE_ROM_NAMES = [
        "^.*STAR.*CASTLE.*$",
        "^.*SEAWEED.*$",
        "^.*ANDREW.*DAVIE.*$",          "^.*DEMO.*IMAGE.*AD.*$" 		// Various 32K Image demos
    ];

    var HINTS_PREFIX_REGEX = "^(|.*?(\\W|_|%20))";
    var HINTS_SUFFIX_REGEX = "(|(\\W|_|%20).*)$";

    var FORMAT_PRIORITY_BOOST = 50;

};

jt.CartridgeDatabase = new jt.CartridgeDatabase();
