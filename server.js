var _ = require('underscore');
var express = require('express');
var consolidate = require('consolidate');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();

var server = require('http').Server(app);
var io = require('socket.io')(server);
app.engine('ejs', consolidate.ejs);
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

var braintree = require('braintree');

var gateway = braintree.connect({
    environment: braintree.Environment.Sandbox,
    merchantId: 'pq77ngc6dhk8xjf4',
    publicKey: 'khy9f8d7jjcs2fpv',
    privateKey: 'd200a4b497ce72eb5e3a0089bdb5f208'
});

var Player = require('./player');

var players = {};
var heights = {};

function getPlayer(uid) {
    if(!players[uid]){
        players[uid] = new Player(uid);
    }
    return players[uid];
}

app.get('/', function (req, res) {
    var uid = req.cookies.uid;
    if(!uid){
        uid = Math.round(Math.rand() * 10000);
        res.cookie('uid', uid);
    }


    var player = getPlayer(uid);

    gateway.clientToken.generate({}, function (err, response) {
        res.render('index', {client_token: response.clientToken, paid: player.paid ? '$$$' : ''});
    });
});

app.post('/checkout', function (req, res) {
    var player = getPlayer(req.cookies.uid);

    var nonce = req.body.payment_method_nonce;

    gateway.transaction.sale({
        amount: '10.00',
        paymentMethodNonce: nonce
    }, function (err, result) {
        if(!err && result.success){
            player.paid = true;
            res.render('payment_successful');
        }else{
            res.render('payment_unsuccessful');
        }
    });
});

server.listen(3000, function () {

    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port)

});

io.on('connection', function (socket) {
    console.log('New socket.io connection.');
    cookieParser()(socket.request, null, function() {
        var player = getPlayer(socket.request.cookies.uid);
        console.log('Player #%s has connected.', player.uid);

        socket.emit('player_info', player.uid);
        socket.emit('track_info', {"name": 'Test track'});

        socket.on('get_height', function(data) {
            if(!heights[data]){
                var max = 120, min = -30;
                heights[data] = Math.random()*(max - min) + min;
            }
            socket.emit('data', {"height": heights[data], "pos": data, "raw": heights[data]})
        });

        socket.on('send_name', function(data) {
            player.name = data;
        });

        socket.on('i_won', function() {
            console.log('Player #%s (%s) has won!', player.uid, player.name);
            socket.broadcast.emit('he_won', player.uid);
        });

        socket.on('send_position', function(data) {
            player.setPosition(data)
        });
    });
});

setInterval(function() {
    var data = {};

    _(players).each(function(player) {
        data[player.uid] = {
            name: player.name,
            x: player.x,
            y: player.y,
            r: player.r,
            fx: player.fx,
            fy: player.fy,
            bx: player.bx,
            by: player.by
        };
    });
    io.sockets.emit('broadcast_positions', data);
}, 50);
