# Pitfall-Agent-Javatari

This repository is a fork of the [Javatari.js](http://javatari.org/) Atari 2600 emulator that has been modified to automatically play the game Pitfall.  An agent controls the player and through trial and error discovers a path through the game.


![ScreenShot](pitfall-demo.gif)

Here is a demo video of a trained 20 minute run: (played at a faster speed)

https://www.youtube.com/watch?v=I4j8xWq1Jsc


# Usage

A pre-built release is included in the repository and may be run by pointing a browser at a local copy of [release/index.html](release/index.html).  New releases are built using Grunt.

To start running the Pitfall agent, a cartridge must be inserted into the emulator.  This should be a Pitfall! ROM.  Anything else won't likely have useful results.  Once a cartridge is loaded, the hooks for the agent will begin and a small user interface will be added to the page.

The controls of Javatari have not been disabled.  Using game controls can mess up the training.  For example, if you help Harry jump over a log, your keys won't be recorded, so he may move to the next screen, but he'll never be able to replay his steps back to that point.

Once the game is running there isn't much to do other than watch and check back occasionally.  Some of the screens will be beat in minutes, but the more challenging ones can take hours to solve.  How long it takes depends somewhat on the speed of your computer.  The game has a time limit of 20 minutes, and on a fast system a full run using all that time can be training in less than 12 hours.

The agent's user interface is added after inserting a cartidge.  This provides checkboxes for determining whether to run at a faster speed and use checkpointing.  Both of these options help the training go faster and are enabled by default.  When running at a faster speed the audio may distort. Checkpointing is used to save the state from the beginning of a screen, so that each training cycle doesn't have to start all the way back at the beginning.

The UI also provides 3 buttons.  The "Reset Training" button will remove all training data in use and stored by the browser.  The "Download State File" takes the currently checkpointed training state (up to the current screen) and downloads it.

The "Load pitfall-state.json" will load that file from the web server and use its state.  Loading a file requires that that the game be running on an actual webserver, rather than via `file://` URLs.  The repository includes a sample JSON for in this place, and a new one may be created with the "Download State File" button.  The sample version has a fully train 20 minute run.


## Logging

After loading a cartridge, a `pitfallAgent` object is added to the JavaScript `window` name space.  This allows access to the agent's API and internals, and it is mostly intended for debugging.

By default, some basic logging to the console of the browser is enabled.  The level of detail can be controlled with`pitfallAgent.setLogLevel(LEVEL)`.  The default is 1, and higher numbers will generate more detailed logs.  Level 3 includes messages about state management, and level 5 includes the individual commands being executed.


# How Does it Work?

## Algorithm

The current algorithm begins by holding the joystick right.  It then randomly chooses between five actions for random durations.  These actions include leaving the controls unchanged, standing still by releasing the right control, pressing the right control again, jumping, and pressing down on the joystick to drop from a vine.

The agent is mostly unaware of the world and its obstacles.  It looks at the score and the player's height, and if either go down, it resets.  This means the agent currently can only play a game on the surface, and that an optimal game where all treasures are gotten in the shortest time is not possible.  In some unfortunate situations the player also may jump over treasure, moving further in the world, but not gaining a higher score.

This version has an optimization where the agent is allowed to check if it is on a vine.  To save on wasted actions the down button will only be pressed when on a vine.  This was done to make the training go faster, but for the purists it can easily be disabled.

Pitfall's design includes obstacles (such as the alligators) that can take a long time to randomly get past with this style.  While the current algorithm demonstrates an easy way to learn to progress through the world, it is definitely possible to modify this to use more interesting machine learning algorithms.

Each screen is treated as an independent level to be solved.  Once a screen is solved the instructions for it are solidified.  There is no optimizing the generated results, so things like pointless random delays will exist.

Random actions are chosen and if they don't help the player get further, they are discarded.  In a situation where they do help the player get further, they may be discarded anyway, since some obstacles (such as the disappearing lakes) would otherwise be impossible.  A solution that makes it further is given a number of tries to progress again, and if it fails, the list of commands is cut back to an earlier point.


## Javatari.js Modifications

The agent was created by building on top of Javatari.js. The code was very clean and straightforward, making it a great platform for developing with.  Some modifications were needed to make this possible.

Public interfaces and new functions were added to provide access to private resources (ram, cpu, bus.) Event hooks were added so that we can get a call each CPU cycle (for input injection) and every time the PC matched a value.  The latter was set against a VSYNC completing, and used to check on and update the game state.  A cycle counter was also added, so that we could be sure input was injected at the same point each run.

Javatari.js had several sources of randomness in it.  Each of these was removed to keep everything fully deterministic.


## Notes on the Internals

The agent has a set of functions that read values directly out of the 2600's RAM. This is needed for doing things like reading the score or finding out the players position.

The emulator [Stella](http://stella.sourceforge.net/) was used to figure out the needed internal addresses.  Stella is a 2600 emulator that has been around for over 20 years.  It includes a full debugger, which made finding the needed addresses simple.

Checkpointing is done any time the player makes it to a new screen.  This involves saving the state of the emulator and the agent.  When resetting, if a checkpoint exists, it is used instead of starting from the beginning to save on the need to walk through all the screens that have already been solved.

LocalStorage is used to store the game state at the time of a checkpoint so that it may be reloaded even if the browser exits.

The game defaults to running at a faster than normal clock speed so that it can train quicker.

These options can be controlled via the UI or APIs.


# Known Issues

## Running Simultaneous Copies

Running multiple copies of this or Javatari in the same browser is not supported.  Saved states are placed in localStorage.  Multiple copies of the game will clobber each other's saves and have undesirable results.

## Insta-death

On rare occasions when entering a new screen, the player will land right on top of a log.  This is problematic, since it then falls back to the new screen checkpoint, and loops between the checkpoint and hitting the log.

To deal with this scenario we keep a counter of consecutive deaths at the start of a screen.  If this goes over a limit we remove the history for the current and prior screen.  This forces the player to walk through the entire world again, since we removed the checkpoint.  The agent then is back on the prior screen which it must solve again.   The new solution results in it entering the next screen at a different time, which hopefully means it doesn't start on top of a log.


# License

Javatari.js is distributed under version 3 of the [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.en.html) (AGPLv3).  The code for the agent is integrated into Javatari.js, and so is distributed under the same license.
