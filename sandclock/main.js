var canvasWidth = 400,
  canvasHeight = 405,
  workTime = 25,
  breakTime = 1,
  pomodoros = 1,
  pomodorosDone = 0,
  runningPomodoros = false,
  startTime = 0,
  defaultSandHue = 52,
  mute=false;

//I've refactored the hourglass object and made it easier to use. Find it on github @ https://github.com/Deftwun/PixelGlass

/* HOURGLASS OBJECT */
//This object tries to encapsulate all the hourglass simulation.
//I dont think this is a good way to build objects though... 
//It seemed like a good idea at the time but there is a lot of 'this' below
//I think It would work just as well to move all the functions outside of this object
// and just have them operate on the properties
//EDIT: no the correct way would have been to use a constructor function with private variables
var hourGlass = {
  tiles: [],            //2D cell array
  width: 99,            //Total cells wide
  height: 100,          //Total cells high
  pixelSize: 4,         //Size of a single cell within canvas
  offsetX: 0,           //X Offset entire cell grid within canvas 
  offsetY: 0,           //Y Offset entire cell grid within canvas
  cylinderHeight: 34,   //Weird variable determines hour glass shape (Tweak it until it works ;) 
  grainsTotal: 0,       //total grains in hourglass
  grainsDropped: 0,     //grains dropped so far
  grainDropDelay: 0,    //time ms between grain of sand drops
  grainTimeAcc: 0,      //Real time buffer / accumulator for grain delay
  time: 0,              //Desired timer time
  startTime:0,          //Timestamp when started
  timeStep: 30,         //Delta time to update every frame
  timeAcc:0,            //Real time buffer / accumulator for simulation update
  lastFrame:0,          //Last simulation update timestamp
  updateLeftRight: true, //Used to alternate 'x axis' update order between simulation updates
  mousePosition: {       //Keep track of mouse position for interactivity
    x: 0,
    y: 0
  }, 

  //Numerical codes represnting different cell types
  pixelCodes: {
    background: 0,
    interior: 1,
    walls: 2,
    walls2: 3,
    base: 4,
    base2: 5,
    base3: 6,
    stopper: 7,
    sand1: 8,
    sand2: 9,
    sand3: 10,
    dummySand: 11,
  },

  //Different color schemes for hourglass
  sandColors:{
    0: "rgba(0,0,0,0)", //Background
    1: "rgba(0,0,75,.1", //Interior
    2: "#86cdf7", //Hourglass walls
    3: "#fdfd05", //Hourglass walls 2
    4: "#6e4e03", //base
    5: "#553c01", //base 2
    6: "#845600", //base 3
    7: "#e2e2e2", //stopper
    8: "#ffe96c", //Sand 1
    9: "#e6d98b", //Sand 2
    10: "#cac4a1", //Sand 3  
    //Dummy sand is sand that is randomly created for visual effect. It doesn't
    //count against total grains dropped and is removed from the simulation 
    //when completely surrounded by obstacles (other sand/walls).
    11: "#ffe96c", //dummy sand
  },
  
  neonSandColors:{
    0: "rgba(0,0,0,0)", //Background
    1: "rgba(0,0,75,.1)", //Interior
    2: "#6acfdd", //Hourglass walls
    //2:"#6cd",
    3: "#ffef00", //Hourglass walls 2
    4: "#6e4e03", //base
    5: "#553c01", //base 2
    6: "#845600", //base 3
    7: "#e2e2e2", //stopper
    8: "hsl(90,50%,50%)", //Sand 1
    9: "hsl(100,50%,50%)", //Sand 2
    10:"hsl(100,50%,50%)", //Sand 3 
    11: "#ffe96c", //dummy sand
  },

  //Render color of different cell types. Assigned to a scheme during creation
  pixelColors: undefined,
  
  //Create the hourglass grid
  create:function() {
    //Change sand color
    this.pixelColors = this.neonSandColors;
    
    //Essentially I build 2 halves of the hourglass (Two 2d arrays) simultaneously. One without sand.
    //Then I reverse bottom half array so that its a mirror of the top (minus sand) and stitch em together
    this.grainsTotal = 0;
    this.grainsDropped = 0;
    this.time = 0;
    this.startTime=0;
    this.running = false;

    var topHalf = [],
      bottomHalf = [],
      w = this.width,
      h = this.height,
      z = this.cylinderHeight;

    for (var y = 0; y < h / 2; y++) {
      var topRow = [],
        bottomRow = [];
      for (var x = 0; x < w; x++) {

        //Hourglass base
        if ((y >= 0 && y <= 2) && (x > z - 3 && x < w - z + 2)) {
          var c = this.pixelCodes.base;
          if (y == 1) c = this.pixelCodes.base2;
          else if (y == 2) c = this.pixelCodes.base3;
          topRow.push(c);
          bottomRow.push(c);
        }

        //Hourglass walls
        else if (x == z || x == z + 1 || x == (w - z - 1) || x == (w - z - 2)) {
          //magic number determines where middle ring lies
          var ringRatio = 1.4;
          var c = y >= (this.cylinderHeight * ringRatio) ? this.pixelCodes.walls2 : this.pixelCodes.walls;
          topRow.push(c);
          bottomRow.push(c);
        }

        //Interior & sand
        else if (x > z && x < (w - z - 1)) {
          if (Math.random() < 0.33) topRow.push(this.pixelCodes.sand1);
          else if (Math.random() < 0.66) topRow.push(this.pixelCodes.sand2);
          else topRow.push(this.pixelCodes.sand3);
          this.grainsTotal++; //<< Count the sand
          bottomRow.push(this.pixelCodes.interior);
        }

        //Exterior / background
        else {
          topRow.push(this.pixelCodes.background);
          bottomRow.push(this.pixelCodes.background);
        }
      }

      //Add rows to top/bottom arrays
      if (z < w / 2 - 3 && y > this.cylinderHeight) z++;
      topHalf.push(topRow);
      bottomHalf.push(bottomRow);
    }

    //Reverse bottom and append to top
    this.tiles = topHalf.concat(bottomHalf.reverse());

    //I kinda cheat here to remove a single grain from the top. Other wise I end up with one that is never dropped
    this.tiles[Math.floor(h / 2 - 1)][Math.floor(w / 2)] = this.pixelCodes.interior;
    this.grainsTotal--;

    //Create Stopper ( aka the grain dropper )
    //This cell looks empty but acts like a wall
    //The 'dropGrain' function expects the stopper to exist in this exact location
    this.tiles[Math.floor(h / 2)][Math.floor(w / 2)] = this.pixelCodes.stopper;
  },

  //calculate & update the grain delay needed for time 't' in millis
  updateDelay:function(t) {
    this.grainDropDelay = Math.floor(t / (this.grainsTotal - this.grainsDropped));
  },

  //Set the desired hourglass time (minutes)
  setTime:function(t){
    this.time = t * 60000;
    this.updateDelay(t);
  },

  //Move a single cell by vector (Cells are swapped)
  moveCell:function(x, y, x1, y1) {
    var tmp = this.tiles[y + y1][x + x1];
    this.tiles[y + y1][x + x1] = this.tiles[y][x];
    this.tiles[y][x] = tmp;
  },

  //Update a single cell
  updateCell:function(x, y) {

    //Only sand cells get updated..
    if (this.tiles[y][x] < this.pixelCodes.sand1) return;
    var interior = this.pixelCodes.interior;
    //Inspect our neighbours
    var blockedBottom = this.tiles[y + 1][x] > interior,
        blockedTop = this.tiles[y - 1][x] > interior,
        blockedRight = this.tiles[y][x + 1] > interior,
        blockedLeft = this.tiles[y][x - 1] > interior,
        blockedBottomLeft = this.tiles[y + 1][x - 1] > interior,
        blockedBottomRight = this.tiles[y + 1][x + 1] > interior;

    //Handle mouse interaction with sand
    var mousePixelSize = 4,
        mouseX = this.mousePosition.x,
        mouseY = this.mousePosition.y;
    
    if (x > mouseX - mousePixelSize - this.offsetX && x < mouseX + mousePixelSize - this.offsetX &&
      y < mouseY + mousePixelSize / 2 - this.offsetY && y > mouseY - mousePixelSize / 2 - this.offsetY) {
      blockedBottom = true;
      blockedBottomLeft = true;
      blockedBottomRight = true;
    }

    //Remove dummy sand from simulation
    if (this.tiles[y][x] == this.pixelCodes.dummySand && blockedBottom && blockedTop && blockedLeft && blockedRight) {
      this.tiles[y][x] = interior;
      return;
    }

    //The magic number 'r' is used to adjust when a grain of sand will move laterally to simulate falling over a cliff or piling up at the bottom. decrease 'n' (closer to 1) to get a steeper peak and pit
    var n = 1,
        r = Math.floor(Math.random() * (this.cylinderHeight * n)),
        w = this.width,
        h = this.height;

    //Movement rules.. (Lots of trial and error was used to get these right.)
    if (!blockedBottom) this.moveCell(x, y, 0, 1); //Straight Down
    else if (!blockedBottomLeft) this.moveCell(x, y, -1, 1); //Down & left
    else if (!blockedBottomRight) this.moveCell(x, y, 1, 1); //Down & right
    else if (x < Math.floor(w / 2) - r && !blockedRight && y < Math.floor(h / 2)) this.moveCell(x, y, 1, 0); //Move grain in the top left, right
    else if (x > Math.floor(w / 2) + r && !blockedLeft && y < Math.floor(h / 2)) this.moveCell(x, y, -1, 0); //Move grain in the top right, left   
    else if (x < Math.floor(w / 2) - r * 3 && !blockedLeft && blockedRight && y > Math.floor(h / 2)) this.moveCell(x, y, -1, 0); //Move bottom right grain, right
    else if (x > Math.floor(w / 2) + r * 3 && !blockedRight && blockedLeft && y > Math.floor(h / 2)) this.moveCell(x, y, 1, 0); //Move bottom-left grain, left
  },

  //Drop a grain of sand from the top half of the glass into the bottom
  dropGrain:function() {

    //The stopper is just a cell that looks like its empty but basically acts like a wall.
    var stoppery = Math.floor(this.height / 2),
      stopperx = Math.floor(this.width / 2),
      tileAbove = this.tiles[stoppery - 1][stopperx],
      tileBelow = this.tiles[stoppery + 1][stopperx];

    if ((tileBelow == this.pixelCodes.interior || tileBelow == this.pixelCodes.dummySand) &&
      (tileAbove >= this.pixelCodes.sand1)) {
      this.grainsDropped++;
      this.moveCell(stopperx, stoppery - 1, 0, 2);
    }
  },

  //Drop a grain of dummy sand (used for visual effect only)
  dropDummyGrain:function() {
    var stoppery = Math.floor(this.height / 2),
      stopperx = Math.floor(this.width / 2);
    if (this.tiles[stoppery + 1][stopperx] == this.pixelCodes.interior) {
      this.tiles[stoppery + 1][stopperx] = this.pixelCodes.dummySand;
    }
  },

  //Update the hourglass grid
  update:function() {
    //What follows is how we keep track of the amount of time that has passed
    // between frames and whether or not it is time to drop a grain of sand. 
    // The delay between drops is updated after every grain to try and get better accuracy
    // This is really ugly. Too much 'this'  (Is it?)
    var now = Date.now(),
        updated = false,
        dt = this.timeStep;
    
    this.timeAcc += now - this.lastFrame;
    this.lastFrame = now;
    
    while (this.timeAcc >= dt){
      updated = true;
      this.timeAcc -= dt;
      this.grainTimeAcc += dt;
      if (this.grainTimeAcc >= this.grainDropDelay) {
        this.updateDelay(this.time - (Date.now()-this.startTime));
        this.grainTimeAcc = 0;
        this.dropGrain();
      } 
      else if (Math.random() > 0.8) {
        this.dropDummyGrain();
      }

      //This will alternate which cells are updated first (left side or right side)
      // It prevents the sand from prefering any one direction and keeps things moving towards/away from the middle
      //Its a hack but so isn't this whole thing really :)
      var w = this.width,
        h = this.height,
        lr = this.leftToRight;
      for (var x = (lr ? w - 1 : 0); (lr ? x > -1 : x < w); (lr ? x-- : x++)) {
        for (var y = h - 1; y > -1; y--) {
          this.updateCell(x, y);
        }
      }
      this.leftToRight = !this.leftToRight;
    }
    return updated;
  },

  //Render the whole hourglass grid
  render:function() {
    //would be better / more modular if the canvas was injected rather than retrieved from dom (Does it really matter?)
    var canvas = document.getElementById("canvas"),
        context = canvas.getContext("2d"),
        w = this.width,
        h = this.height,
        s = this.pixelSize;
    
    context.clearRect(0,0,canvas.width,canvas.height);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var cell = this.tiles[y][x];
        //Ignore background tiles
          if (cell != this.pixelCodes.background) {
            context.fillStyle = this.pixelColors[cell];
            if (cell == this.pixelCodes.dummySand) context.fillStyle = this.pixelColors[this.pixelCodes.sand1];
            context.fillRect((x + this.offsetX) * s + (s / 2), (y + this.offsetY) * s + (s / 2), s, s);
          }
      }
    }
  },

  //Start the Hourglass simulation
  //@mins = the number of minutes requried for the hourglass simulation to run
  //@callback = function to call when the timer is done (All the sand has dropped)
  start:function(mins, callback) {
    var now = Date.now();
    this.setTime(mins);
    this.startTime = now;
    this.lastFrame = now;
    this.timeAcc = 0;
    this.grainTimeAcc = 0;
    this.running = true;
    var me = this;
    var loop = function(){
      if (me.running && me.update()) me.render();
      if (me.grainsDropped >= me.grainsTotal) {
        this.running = false;
        callback();
      }
      else if (me.running === true) requestAnimationFrame(loop);
    };
    loop();
  },
};

/* ************************************************
  End of the hourglass object
  Below is what makes up the 'glue' between the DOM and the hourglass simulation
  *************************************************
*/


//Rotate canvas by angle (degrees);
function rotateCanvas(a) {
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(a * Math.PI / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
}

//Play an HTML audio element
function playSound(audioId){
  if (!mute)document.getElementById(audioId).play();
}

//Reset the hourglass and prepare for next countdown
function resetHourGlass() {
  $("#message").html("Click to Start");
  var canvas = document.getElementById("canvas");
  canvas.getContext("2d").setTransform(1, 0, 0, 1, 0, 0);
  rotateCanvas(180);
  hourGlass.create();
  hourGlass.render();
}

//Play the hourglass flip animation & start the countdown once finished
//mins = total countdown time
//callback = function to call once countdown timer is complete
function startHourGlass(mins, callback) {
  var t = 30,deltaAngle=20,angle=0,lastFrame = Date.now();
  var animateHourGlass = function(){
    if (angle < 180){
      requestAnimationFrame(animateHourGlass);
      var now = Date.now(),
          dt = now - lastFrame;
      if (dt > t){
        lastFrame = now;
        angle+=deltaAngle;
        rotateCanvas(deltaAngle);
        hourGlass.render();
      }
    }
    else {
      hourGlass.start(mins,callback);
    }
  };
  animateHourGlass();
}

//Will continue to update elapsed time until pomodoros are done
function updateElapsedTime() {
  if (runningPomodoros) {
    requestAnimationFrame(updateElapsedTime);
    var seconds = Math.floor((Date.now() - startTime) / 1000);
    var m = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
    var s = Math.floor(((seconds % 31536000) % 86400) % 3600) % 60;
    $("#elapsed-time").html(("00" + m).slice(-2) + ":" + ("00" + s).slice(-2));
  }
}

//start the next queued pomodoro
function nextPomodoro() {
  playSound("sound-work");
  flashElement($("#message"));
  var doneBreaking = function() {
    playSound("sound-pomodoro");
    flashElement($("#pomodoros-control-box"));
    $("#work-control-box").css({"background-color":"#444441"});
    $("#break-control-box").css({"background-color":"#222"});
    pomodorosDone++;
    if (pomodoros-pomodorosDone == 1){
      $("#pomodoros-complete").html("This is your last one!");
    }
    else if (pomodoros-pomodorosDone === 0){
      $("#pomodoros-complete").html("You did it!");
    }
    else{
      $("#pomodoros-complete").html("Only " + (pomodoros - pomodorosDone) + " to go!");
    }
    if (pomodorosDone < pomodoros) nextPomodoro();
    else done();
  };
  var doneWorking = function() {
    playSound("sound-break");
    flashElement($("#message"));
    $("#work-control-box").css({"background-color":"#222"});
    $("#break-control-box").css({"background-color":"#444441"});
    resetHourGlass();
    $("#message").html("Break Time!");
    startHourGlass(breakTime, doneBreaking);
  };
  resetHourGlass();
  startHourGlass(workTime, doneWorking);
  $("#pomodoros-complete").html("Only " + (pomodoros - pomodorosDone) + " to go!");
  $("#message").html("Get To Work!");
}

//Start the pomodoro queue
function start() {
  $("#work-control-box").css({"background-color":"#444441"});
  $(".time-control").fadeOut(1000);
  $("#elapsed-time").html("00:00");
  $("#pomodoros-complete").html("");
  startTime = Date.now();
  runningPomodoros = true;
  pomodorosDone = 0;
  updateElapsedTime();
  nextPomodoro();
}

//All pomodoros completed
function done() {
  $("#pomodoros-complete").html("");
  playSound("sound-done");
  flashElement($("#message"));
  $("#work-control-box").css({"background-color":"#222"});
  $("#message").html("Congratulations you completed " + pomodorosDone + " Pomodoros!");
  $(".time-control").fadeIn(1000);
  runningPomodoros = false;
}

//Cancel queued pomodoros & reset hourglass
function cancel() {
  $("#pomodoros-complete").html("");
  playSound("sound-cancel");
  $("#work-control-box").css({"background-color":"#222"});
  $(".time-control").fadeIn(1000);
  runningPomodoros = false;
  resetHourGlass(); 
}

//Make a DOM Element flash
function flashElement(elem){
  var bg = elem.css("background-color");
  elem.css({"background-color":"#777"});
  elem.animate({opacity:0},250,function(){
    elem.animate({opacity:1},250,function(){
      elem.css({"background-color":bg});
    });
  });
}

//Set the color of the sand (value between 0 & 255)
function setSandHue(hue){
  hourGlass.pixelColors[hourGlass.pixelCodes.sand1] = "hsl(" + hue + ",70%,60%)";
  hourGlass.pixelColors[hourGlass.pixelCodes.sand2] = "hsl(" + hue + ",65%,50%)";
  hourGlass.pixelColors[hourGlass.pixelCodes.sand3] = "hsl(" + hue + ",80%,65%)";
  hourGlass.render();
}

//Document Ready
$("document").ready(function() {

  $("#work-time").html(workTime + " Minutes");
  $("#break-time").html(breakTime + " Minutes");
  $("#pomodoros").html(pomodoros);

  var canvas = document.getElementById("canvas");
  canvas.setAttribute("width", canvasWidth);
  canvas.setAttribute("height", canvasHeight);

  //Update Mouse cell position
  canvas.addEventListener('mousemove', function(evt) {
    var rect = canvas.getBoundingClientRect();
    hourGlass.mousePosition = {
      x: Math.floor((evt.clientX - rect.left) / hourGlass.pixelSize),
      y: Math.floor((evt.clientY - rect.top) / hourGlass.pixelSize)
    };
  }, false);

  //Hourglass Click
  canvas.addEventListener('click', function() {
    if (!runningPomodoros) start();
    else $("#myModal").modal("show");
  });

  //Reset the hourglass to default state
  resetHourGlass();
  //Create the color customization slider
  var slider = $("#slider");
  slider.slider();
  slider.slider("option","max","255");
  slider.slider("option","value",defaultSandHue);
  slider.on("slide",function(event, ui){
    setSandHue(slider.slider("option","value"));
  })
  setSandHue(defaultSandHue);

  //Window resizing
  window.onresize = function() {
    if (window.innerWidth < 1200) {
      $(".control-box").css("transform", "translateY(-50%)");
      $(".control-box p").not(".text-primary").css("font-size", "14px");
      $(".btn").removeClass("btn-lg").addClass("btn-default");
      $(".text-primary").addClass("vertical-center");
    } else {
      $(".control-box").css("transform", "translateY(+50%)");
      $(".control-box p").not(".text-primary").css("font-size", "18px");
      $(".control-box").css("display", "block");
      $(".btn").removeClass("btn-default").addClass("btn-lg");
      $(".text-primary").removeClass("vertical-center");
      $("#hide-button").html("Hide Controls");
    }
  };
  window.onresize();

  //Buttons
  $("#reset-color-button").click(function(){
    setSandHue(defaultSandHue);
    $("#slider").slider("option","value",defaultSandHue);
  });
  $("#cancel-timer").click(function() {
    cancel();
  });
  $("#resume-timer").click(function() {
    //Nothing needed here
  });
  $("#mute-button").click(function(){
    mute=!mute;
    if (mute) $(this).html("Sound <i class='fa fa-2x fa-volume-off'></i>");
    else $(this).html("Sound <i class='fa fa-2x fa-volume-up'></i>");
  });
  $("#hide-button").click(function() {
    var text = $("#hide-button").html();
    if (text == "Hide Controls") {
      $(".control-box").css("display", "none");
      $("#hide-button").html("Show Controls");
    } else {
      $(".control-box").css("display", "block");
      $("#hide-button").html("Hide Controls");
    }
  });
  $("#work-time-up").click(function() {
    if (workTime < 60) $("#work-time").html(++workTime + " Minutes");
  });
  $("#work-time-down").click(function() {
    if (workTime > 1) $("#work-time").html(--workTime + " Minutes");
  });
  $("#break-time-up").click(function() {
    if (breakTime < 60) $("#break-time").html(++breakTime + " Minutes");
  });
  $("#break-time-down").click(function() {
    if (breakTime > 1) $("#break-time").html(--breakTime + " Minutes");
  });
  $("#pomodoro-up").click(function() {
    $("#pomodoros").html(++pomodoros);
  });
  $("#pomodoro-down").click(function() {
    if (pomodoros > 1) $("#pomodoros").html(--pomodoros);
  });
});