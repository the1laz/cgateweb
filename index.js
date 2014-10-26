var mqtt = require('mqtt'), url = require('url');
var net = require('net');
var events = require('events');
var settings = require('./settings.js');

var buffer = "";
var eventEmitter = new events.EventEmitter();

// MQTT URL
var mqtt_url = url.parse('mqtt://'+settings.mqtt);

// Create an MQTT client connection
var client = mqtt.createClient(mqtt_url.port, mqtt_url.hostname);

var HOST = settings.cbusip;
var COMPORT = 20023;
var EVENTPORT = 20025;


// Connect to cgate via telnet
var command = new net.Socket();
command.connect(COMPORT, HOST, function() {

  console.log('CONNECTED TO: ' + HOST + ':' + COMPORT);
  command.write('EVENT ON\n');

});


// Connect to cgate event port via telnet
var event = new net.Socket();
event.connect(EVENTPORT, HOST, function() {

  console.log('CONNECTED TO: ' + HOST + ':' + EVENTPORT);

});


client.on('connect', function() { // When connected

  // Subscribe to MQTT
  client.subscribe('cbus/write/#', function() {

    // when a message arrives, do something with it
    client.on('message', function(topic, message, packet) {
      parts = topic.split("/");
      if (parts.length > 5)

      switch(parts[5].toLowerCase()) {

        // Get updates from all groups
        case "getall":
          command.write('GET //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/* level\n');
          break;

        // On/Off control
        case "switch":
          console.log(message);
          if(message == "ON") {command.write('ON //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n')};
          if(message == "OFF") {command.write('OFF //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n')}; 
          break;

        // Ramp, increase/decrease, on/off control
        case "ramp":
          switch(message.toUpperCase()) {
            case "INCREASE":
              eventEmitter.on('level',function increaseLevel(address,level) {
                if (address == parts[2]+'/'+parts[3]+'/'+parts[4]) {
                  command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+Math.min((level+26),255)+' '+'\n');
                  eventEmitter.removeListener('level',increaseLevel);
                }
              });
              command.write('GET //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' level\n');
              
              break;

            case "DECREASE":
              eventEmitter.on('level',function decreaseLevel(address,level) {
                if (address == parts[2]+'/'+parts[3]+'/'+parts[4]) {
                  command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+Math.max((level-26),0)+' '+'\n');
                  eventEmitter.removeListener('level',decreaseLevel);
                }
              });
              command.write('GET //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' level\n');

              break;

            case "ON":
              command.write('ON //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n');
              break;
            case "OFF":
              command.write('OFF //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+'\n');
              break;
            default:           
              var ramp = message.split(",");
              var num = Math.round(parseInt(ramp[0])*255/100)
              if (!isNaN(num) && num < 256) {
                console.log('length:'+ramp.length);
                if (ramp.length > 1) {
                  command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+' '+ramp[1]+'\n');
                } else {
                  command.write('RAMP //'+settings.cbusname+'/'+parts[2]+'/'+parts[3]+'/'+parts[4]+' '+num+'\n');
                }
              }
          }
          break;
        default:
      }
    });
  });

  // publish a message to a topic
  client.publish('hello/world', 'CBUS ON', function() {
  });
});



command.on('data',function(data) {
  var lines = (buffer+data.toString()).split("\n");
  buffer = lines[lines.length-1];
  if (lines.length > 1) {
    for (i = 0;i<lines.length-1;i++) {
      var parts1 = lines[i].toString().split("-");
      if(parts1.length > 1 && parts1[0] == "300") {
        var parts2 = parts1[1].toString().split(" ");

        address = (parts2[0].substring(0,parts2[0].length-1)).split("/");
        var level = parts2[1].split("=");
        if (parseInt(level[1]) == 0) {
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});          
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],0);
        } else {
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , Math.round(parseInt(level[1])*100/255).toString(), function() {});
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],Math.round(parseInt(level[1])));

        }
      } else {
        var parts2 = parts1[0].toString().split(" ");
        if (parts2[0] == "300") {
        address = (parts2[1].substring(0,parts2[1].length-1)).split("/");
        var level = parts2[2].split("=");
        if (parseInt(level[1]) == 0) {
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});          
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],0);
        } else {
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , Math.round(parseInt(level[1])*100/255).toString(), function() {});
          eventEmitter.emit('level',address[3]+'/'+address[4]+'/'+address[5],Math.round(parseInt(level[1])));

        }
          
        }
      }
    }
  }
});


// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
event.on('data', function(data) {
    
    var parts = data.toString().split(" ");
    if(parts[0] == "lighting") {
      address = parts[2].split("/");
      switch(parts[1]) {
        case "on":	
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'ON', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '100', function() {});
          break;
        case "off":
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/state' , 'OFF', function() {});
          client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
          break;
        case "ramp":
          if(parseInt(parts[3]) > 0) {
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/status' , 'ON', function() {});
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , Math.round(parseInt(parts[3])*100/255).toString(), function() {});
          } else {
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/status' , 'OFF', function() {});
            client.publish('cbus/read/'+address[3]+'/'+address[4]+'/'+address[5]+'/level' , '0', function() {});
          }
          break;
        default:
      }
    }
    
});
