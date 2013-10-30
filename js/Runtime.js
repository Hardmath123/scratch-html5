// Copyright (C) 2013 Massachusetts Institute of Technology
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 2,
// as published by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

// Scratch HTML5 Player
// Runtime.js
// Tim Mickel, July 2011

// Runtime takes care of the rendering and stepping logic.

'use strict';

var t = new Timer();

var Runtime = function() {
    this.scene = null;
    this.sprites = [];
    this.reporters = [];
    this.keysDown = {};
    this.mouseDown = false;
    this.mousePos = [0, 0];
    this.audioContext = null;
    this.audioGain = null;
    this.audioPlaying = [];
    this.notesPlaying = [];
    this.projectLoaded = false;
}
  
// Initializer for the drawing and audio contexts.
Runtime.prototype.init = function() {
    this.scene = $('#container');
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    this.audioGain = this.audioContext.createGainNode();
    this.audioGain.connect(runtime.audioContext.destination);
}
  
// Load start waits for the stage and the sprites to be loaded, without
// hanging the browser.  When the loading is finished, we begin the step
// and animate methods.
Runtime.prototype.loadStart = function() {
    if (!runtime.stage.isLoaded()) {
        setTimeout(function(runtime) { runtime.loadStart(); }, 50, this);
        return;
    }
    for (var obj = 0; obj < runtime.sprites.length; obj++) {
        if (typeof(runtime.sprites[obj]) == 'object' && runtime.sprites[obj].constructor == Sprite) {
            if (!runtime.sprites[obj].isLoaded()) {
                setTimeout(function(runtime) { runtime.loadStart(); }, 50, this);
                return;
            }
        }
    }
    if (Instr.wavsLoaded != Instr.wavCount) {
        setTimeout(function(runtime) { runtime.loadStart(); }, 50, this);
        return;
    }
    $('#info').html("Loaded!");
    setInterval(this.step, 33);
    this.projectLoaded = true;
}

Runtime.prototype.greenFlag = function() {
    if (this.projectLoaded) {
        interp.activeThread = new Thread(null);
        interp.threads = [];
        this.startGreenFlags();
    }
}

Runtime.prototype.stopAll = function() {
    interp.activeThread = new Thread(null);
    interp.threads = [];
    stopAllSounds();
    // Hide reporters
    for (var s = 0; s < runtime.sprites.length; s++) {
        if (typeof runtime.sprites[s].hideBubble == 'function')
            runtime.sprites[s].hideBubble();
    }
}

// Step method for execution - called every 33 milliseconds
Runtime.prototype.step = function() {
    interp.stepThreads();
    for (var r = 0; r < runtime.reporters.length; r++) {
        runtime.reporters[r].update();
    }
}
  
// Stack functions -- push and remove stacks
// to be run by the interpreter as threads.
Runtime.prototype.allStacksDo = function(f) {
    var stage = runtime.stage;
    var stack;
    for (var i = runtime.sprites.length-1; i >= 0; i--) {
        var o = runtime.sprites[i];
        if(typeof(o) == 'object' && o.constructor == Sprite) {
            $.each(o.stacks, function(index, stack) {
                f(stack, o);
            });
        }
    }
    $.each(stage.stacks, function(index, stack) {
       f(stack, stage); 
    });
}
  
// Hat triggers
Runtime.prototype.startGreenFlags = function() {
    function startIfGreenFlag(stack, target) {
        if (stack.op == 'whenGreenFlag') interp.toggleThread(stack, target);
    }
    this.allStacksDo(startIfGreenFlag);
}
  
Runtime.prototype.startKeyHats = function(ch) {
    var keyName = null;
    if (('A'.charCodeAt(0) <= ch) && (ch <= 'Z'.charCodeAt(0)) ||
        ('a'.charCodeAt(0) <= ch) && (ch <= 'z'.charCodeAt(0)))
        keyName = String.fromCharCode(ch).toLowerCase();
    if (('0'.charCodeAt(0) <= ch) && (ch <= '9'.charCodeAt(0)))
        keyName = String.fromCharCode(ch);

    if (ch == 37) keyName = "left arrow";
    if (ch == 39) keyName = "right arrow";
    if (ch == 38) keyName = "up arrow";
    if (ch == 40) keyName = "down arrow";
    if (ch == 32) keyName = "space";

    if (keyName == null) return;
    var startMatchingKeyHats = function (stack, target) {
        if ((stack.op == "whenKeyPressed") && (stack.args[0] == keyName)) {
            // Only start the stack if it is not already running
            if (!interp.isRunning(stack)) 
                interp.toggleThread(stack, target);
        }
    }
    runtime.allStacksDo(startMatchingKeyHats);
}
  
Runtime.prototype.startClickedHats = function(sprite) {
    function startIfClicked(stack, target) {
        if(target == sprite && stack.op == "whenClicked") {
            if(!interp.isRunning(stack))
                interp.toggleThread(stack, target);
        }
    }
    runtime.allStacksDo(startIfClicked);
}
  
// Returns true if a key is pressed.
Runtime.prototype.keyIsDown = function(ch) {
    return this.keysDown[ch] || false;
}
  
// Sprite named -- returns one of the sprites on the stage.
Runtime.prototype.spriteNamed = function(n) {
    if (n == 'Stage') return this.stage;
    var selected_sprite = null;
    $.each(this.sprites, function(index, s) {
        if (s.objName == n) {
            selected_sprite = s;   
            return false;
        }
    });
    return selected_sprite;
}
  
// Reassigns z-indices for layer functions
Runtime.prototype.reassignZ = function(target, move) {
    var sprites = this.sprites;
    var oldIndex = -1;
    $.each(this.sprites, function(index, sprite) {
        if (sprite == target) {
            // Splice out the sprite from its old position
            oldIndex = index;
            sprites.splice(index, 1);
        }
    });
    
    if (move == null) {
        // Move to the front
        this.sprites.splice(this.sprites.length, 0, target);
    } else if (oldIndex - move >= 0 && oldIndex - move < this.sprites.length+1) {
        // Move to the new position
        this.sprites.splice(oldIndex - move, 0, target);
    } else {
        // No change is required
        this.sprites.splice(oldIndex, 0, target);
    }      
    
    // Renumber the z-indices
    var newZ = 1;
    $.each(this.sprites, function(index, sprite) {
        sprite.z = newZ;
        sprite.updateLayer();
        newZ++;
    });
}