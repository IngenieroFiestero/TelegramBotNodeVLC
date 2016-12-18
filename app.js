var TelegramBot = require('node-telegram-bot-api');
var http = require('http'),
    fs   = require('fs');
var path = require('path');
var token = '316700190:AAFoEkfMl3Ig69Rptp8x1Yjzu8NOgOebNPM';
var VlcService = require("./droopy-vlc-master/VlcService.js"),
    vlc = new VlcService("http://:1234@localhost:8080");
var chistes = require("./chistes.json");
var chiste = 0;
var playlist = [];
vlc.playlist().then(function(vlcPlaylist) {
  playlist = vlcPlaylist.playlist;
  console.log(playlist);
});

/**
 * El Bot que controla VLC
playlist - Lista de canciones.
poll - Muestra el estado de la votacion para la siguiente cancion
volume - 0-100 Para ajustar el volumen de la musica por votación
chistes - Te cuento un chiste friki para Telecos
help - Listado de Comandos
 */
var bot = new TelegramBot(token, { polling: true });
var BotTools = require('./bot-tools.js');
var botOpts = {reply_markup : BotTools.createCompleteRelpyKeyboard([
  ['⏪/prev','🎵/playlist','📊/poll','⏩/next'],['🔇/volume 0','🔉/volume 50','🔊/volume 100'],['💬/chistes','❓/help']])};
/**
 * Comando de ayuda
 */
bot.onText(/\/help/, function (msg, match) {
  var chatId = msg.chat.id;
  bot.sendMessage(chatId, "/playlist Lista de canciones. \n /poll Muestra el estado de la votacion para la siguiente cancion. \n /volume 0-100 Para ajustar el volumen de la musica. \n /chistes Te cuento un chiste friki para Telecos. \n /0 Vota para cambiar a la primera cancion(,1,2...)",botOpts);
});
/**
 * Comando para mostrar la playlist
 */
bot.onText(/\/playlist/, function (msg, match) {
  var chatId = msg.chat.id;
  getStatus((err)=>{
    if(err){
      bot.sendMessage(chatId, 'No hay ninguna cancion en la playlist.',botOpts);
    }else{
      var res = "Esta es la playlist: \n";
      for(var i = 0; i < playlist.length; i++){
        res += "/"+  i + (playlist[i].current ? " (\u25B6)" : "")+" - " + playlist[i].name + "\n";
      }
      console.log(res);
      bot.sendMessage(chatId, res,botOpts);
    }
  });//Para actualizar la posicion de la cancion actual
});
/**
 * Chiste Teleco
 */
bot.onText(/\/chistes/, function (msg, match) {
  var chatId = msg.chat.id;
  bot.sendMessage(chatId, chistes.teleco[chiste],botOpts);
  chiste = (chiste+1)%chistes.teleco.length
});
/**
 * Ver el estado de la votacion para la siguiente cancion
 */
bot.onText(/\/poll/, function (msg, match) {
  var chatId = msg.chat.id;
  bot.sendMessage(chatId, generatePollRes(),botOpts);
});
bot.onText(/\/next/, function (msg, match) {
  var chatId = msg.chat.id;
   var cancion = (cancionActual()+1)%playlist.length;
  if(!cancionPedida){
    pedirCancion();
  }
  votacionSiguienteCancion[cancion]++;
  bot.sendMessage(chatId, generatePollRes(),botOpts);
});
bot.onText(/\/prev/, function (msg, match) {
  var chatId = msg.chat.id;
  var cancion = (cancionActual()-1);
  var cancion = cancion < 0 ? playlist.length -1 : cancion;
  if(!cancionPedida){
    pedirCancion();
  }
  votacionSiguienteCancion[cancion]++;
  bot.sendMessage(chatId, generatePollRes(),botOpts);
});
/**
 * Comando para cambiar el volumen
 */
bot.onText(/\/volume(.+)/, function (msg, match) {
  var chatId = msg.chat.id;
  var volumen = parseInt(match[1]) || 100;
  if(!votacionVolumen){
    cambiarVolumen();
  }
  votacionVolumenArray.push(volumen);
  bot.sendMessage(chatId, "Peticion de cambio de volumen",botOpts);
});
/**
 * Comando para elegir siguiente cancion
 */
bot.onText(/\/[0-9]/ , function (msg, match) {
  var chatId = msg.chat.id;
  getStatus();
  var num = parseInt((""+match[0]).substring(1));
  console.log(match);
  console.log(num);
  if(num < playlist.length && num >= 0){
    if(cancionPedida){
      votacionSiguienteCancion[num]++;
      bot.sendMessage(chatId, generatePollRes(),botOpts);
    }else{
      pedirCancion();
      votacionSiguienteCancion[num]++;
      bot.sendMessage(chatId, generatePollRes(),botOpts);
    }
  }else{
    bot.sendMessage(chatId, "No valido",botOpts);
  }
});
/**
 * Comandos para interactuar con los usuarios y hacer votaciones
 */
var switchToSong = function(pos){
  if(pos < playlist.length && pos >= 0){
    vlc.play(playlist[pos].id).then(function(vlcStatus) {
      actualizarEstado(vlcStatus);
    });
  }
}
/**
 * Crear votacion para playlist
 */
var generatePollRes = function(){
  var res = "Esta es la playlist: \n";
  if(cancionPedida){
    for(var i = 0; i < playlist.length; i++){
      res += "/"+  i + (playlist[i].current ? " (\u25B6)" : "")+" - " + playlist[i].name + " votos:" + votacionSiguienteCancion[i] + "\n";
    }
  }else{
    res = "No hay ninguna votacion en proceso";
  }
  return res;
}
/**
 * Cuando pidamos el estado del reproductor lo guardaremos
 */
var actualizarEstado = function(vlcStatus){
  playlist.forEach((val,i)=>{
    if(val.id == vlcStatus.currentId){
      val.current = true;
      val.position = parseFloat(vlcStatus.position);
    }else{
      val.current = false;
      val.position = 0;
    }
  });
}
/**
 * Pedir estado del reproductor
 */
var getStatus = function(cb){
  vlc.status().then(function(vlcStatus) {
    actualizarEstado(vlcStatus);
    cb();
  }).catch(function(err){
    cb(err);
  });
}
var cancionActual = function(){
  for(var i = 0; i < playlist.length; i++){
    if(playlist[i].current){
      return i;
    }
  }
  return 0;
}
var cancionPedida = false;//Se ha pedido una cancion y hay que hacer una votacion
var votacionSiguienteCancion = [];//Votos para cada cancion

/**
 * Crear una votacion para la siguiente cancion
 */
var pedirCancion = function(pos){
  cancionPedida = true;
  votacionSiguienteCancion = [];
  for(var i = 0; i < playlist.length; i++){
    votacionSiguienteCancion.push(0);
  }
  //Esperar hasta 20 segundos antes de que acabe la cancion para decidir la siguiente cancion
  tiempoRestante((tiempo1)=>{
    var time = tiempo1 > 3000 ? tiempo1-3000 : 0;
    console.log(time);
    setTimeout(function() {
      //Esperar hasta 3 segundos antes de acabar la cancion para saltar a otra
      cancionPedida = false;
      var cancion = 0;
      var votos = votacionSiguienteCancion[0];
      for(var i = 1; i < votacionSiguienteCancion.length; i++){
        if(votacionSiguienteCancion[i] > votos){
          votos = votacionSiguienteCancion[i];
          cancion = i;
        }
      }
      switchToSong(cancion);
    }, parseInt(time));
  });
}
/**
 * Tiempo que le queda de reproduccion a la cancion
 */
var tiempoRestante = function(cb){
  vlc.status().then(function(vlcStatus) {
    actualizarEstado(vlcStatus);
    var encontrado = false;
    for(var i = 0; i < playlist.length; i++){
      if(playlist[i].current){
        encontrado = true;
        cb((1-playlist[i].position)*playlist[i].duration*1000);
      }
    }
    if(!encontrado){
      cb(5000);
    }
  });
}

var votacionVolumen = false;//Votacion para cambiar volumen
var votacionVolumenArray = [];//Resultados de votacion del volumen

/**
 * Crear una votacion para la siguiente cancion
 */
var cambiarVolumen = function(){
  votacionVolumen = true;
  votacionVolumenArray = [];
  //Esperar hasta 20 segundos antes de que acabe la cancion para decidir la siguiente cancion
  tiempoRestante((tiempo1)=>{
    var time = tiempo1*0.15;
    console.log("Tiempo hasta cierre votacion : " + time);
    setTimeout(function() {
      //Esperar hasta 3 segundos antes de acabar la cancion para saltar a otra
      votacionVolumen = false;
      var valor = votacionVolumenArray[0];
      for(var i = 1; i < votacionVolumenArray.length; i++){
        valor += votacionVolumenArray[i];
      }
      valor = valor/votacionVolumenArray.length;
      console.log("Valor Final: " +valor);
      vlc.volume(valor).then((vlcStatus)=>{});
    }, parseInt(time));
  });
}