// app.js

var cfenv = require( 'cfenv' );
var Cloudantlib = require( '@cloudant/cloudant' );
var express = require( 'express' );
var bodyParser = require( 'body-parser' );
var crypto = require( 'crypto' );
var fs = require( 'fs' );
var i18n = require( 'i18n' );
var jwt = require( 'jsonwebtoken' );
var multer = require( 'multer' );
var os = require( 'os' );
var session = require( 'express-session' );
var uuidv1 = require( 'uuid/v1' );
var app = express();

var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

var db = null;
var cloudant = null;
if( settings.db_username && settings.db_password ){
  var params = { account: settings.db_username, password: settings.db_password };
  if( settings.db_hostname ){
    var protocol = settings.db_protocol ? settings.db_protocol : 'http';
    var url = protocol + '://' + settings.db_username + ":" + settings.db_password + "@" + settings.db_hostname;
    if( settings.db_port ){
      url += ( ":" + settings.db_port );
    }
    params = { url: url };
  }
  cloudant = Cloudantlib( params );

  if( cloudant ){
    cloudant.db.get( settings.db_name, function( err, body ){
      if( err ){
        if( err.statusCode == 404 ){
          cloudant.db.create( settings.db_name, function( err, body ){
            if( err ){
              //. 'Error: server_admin access is required for this request' for Cloudant Local
              //. 'Error: insernal_server_error'
              db = null;
            }else{
              db = cloudant.db.use( settings.db_name );
              //. デザインドキュメント作成
              createDesignDocuments();
            }
          });
        }else{
          db = null;
        }
      }else{
        db = cloudant.db.use( settings.db_name );
        db.get( "_design/documents", {}, function( err, body ){
          if( err ){
            //. デザインドキュメント作成
            createDesignDocuments();
          }else{
          }
        });
      }
    });
  }
}

var nlc = null;
if( settings.nlc_username && settings.nlc_password ){
  var url = ( settings.nlc_url ? settings.nlc_url : 'https://gateway.watsonplatform.net/natural-language-classifier/api/' );
  nlc = new nlcv1({
    username: settings.nlc_username,
    password: settings.nlc_password,
    version: 'v1',
    url: url
  });
}

app.set( 'superSecret', settings.superSecret );
app.use( express.static( __dirname + '/public' ) );
//app.use( bodyParser.urlencoded( { extended: true, limit: '10mb' } ) );
//app.use( multer( { dest: './tmp/' } ).single( 'attachment_file' ) );
app.use( multer( { dest: './tmp/' } ).single( 'attachment_file' ) );
app.use( bodyParser.urlencoded() );
app.use( bodyParser.json() );

app.use( session({
  secret: settings.superSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,           //. https で使う場合は true
    maxage: 1000 * 60 * 60   //. 60min
  }
}) );

app.set( 'views', __dirname + '/templates' );
app.set( 'view engine', 'ejs' );

i18n.configure({
  locales: ['en'],
  directory: __dirname + '/locales'
});
app.use( i18n.init );

app.get( '/', function( req, res ){
  if( req.session && req.session.token ){
    var token = req.session.token;
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( !err && user ){
        res.render( 'index', { user: user } );
      }else{
        res.render( 'index', { user: null } );
      }
    });
  }else{
    res.render( 'index', { user: null } );
  }
});

app.get( '/admin', function( req, res ){
  if( req.session && req.session.token ){
    var token = req.session.token;
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err || !user ){
        //res.render( 'login', { message: 'Invalid token.' } );
        res.redirect( '/login?message=Invalid token.' );
      }else{
        res.render( 'admin', { user: user } );
      }
    });
  }else{
    res.redirect( '/login' );
  }
});

app.get( '/login', function( req, res ){
  var message = ( req.query.message ? req.query.message : '' );
  res.render( 'login', { message: message } );
});

app.post( '/login', function( req, res ){
  res.contentType( 'application/json' );
  var user_id = req.body.user_id;
  var password = req.body.password;

  //. Hash
  generateHash( password ).then( function( value ){
    password = value;

    db.get( user_id, { include_docs: true }, function( err, user ){
      if( err ){
        res.redirect( '/login?message=Not valid user_id or password.' );
        //res.status( 401 );
        //res.write( JSON.stringify( { status: false, result: 'Not valid user_id/password.' }, 2, null ) );
        //res.end();
      }else{
        if( user_id && password && user.password == password ){
          var token = jwt.sign( user, app.get( 'superSecret' ), { expiresIn: '25h' } );
          req.session.token = token;
          res.redirect( '/admin' );

          //res.write( JSON.stringify( { status: true, token: token }, 2, null ) );
          //res.end();
        }else{
          res.redirect( '/login?message=Not valid user_id or password.' );
          //res.status( 401 );
          //res.write( JSON.stringify( { status: false, result: 'Not valid user_id/password.' }, 2, null ) );
          //res.end();
        }
      }
    });
  });
});

app.post( '/logout', function( req, res ){
  req.session.token = null;
  //res.redirect( '/' );
  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});

app.post( '/adminuser', function( req, res ){
  res.contentType( 'application/json' );

  db.list( { include_docs: true }, function( err, body ){
    if( err ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
      res.end();
    }else{
      var found = false;
      body.rows.forEach( function( doc ){
        var user = JSON.parse( JSON.stringify( doc.doc ) );
        if( user._id.indexOf( '_' ) !== 0 && user.type == 'user' && user.role == 0 ){
          found = true;
        }
      });
      if( found ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: 'user with role = 0 already existed.' }, 2, null ) );
        res.end();
      }else{
        var user_id = req.body.id ? req.body.id : 'admin'; //req.body.id;
        var password = req.body.password;
        if( !password ){
          res.status( 401 );
          res.write( JSON.stringify( { status: false, result: 'No password provided.' }, 2, null ) );
          res.end();
        }else{
          //. Hash
          generateHash( password ).then( function( value ){
            password = value;

            db.get( user_id, { include_docs: true }, function( err, user ){
              if( err ){
                var name = req.body.name ? req.body.name : user_id;
                var email = req.body.email ? req.body.email : 'admin@admin';

                var user = {
                  _id: user_id,
                  type: 'user',
                  password: password,
                  name: name,
                  role: 0,
                  email: email,
                  timestamp: ( new Date() ).getTime()
                };
                db.insert( user, function( err, body ){
                  if( err ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
                    res.end();
                  }
                });
              }else{
                res.status( 400 );
                res.write( JSON.stringify( { status: false, result: 'User ' + user_id + ' already existed.' }, 2, null ) );
                res.end();
              }
            });
          });
        }
      }
    }
  });
});

app.get( '/single/:id', function( req, res ){
  var id = req.params.id;
  //var noheader = ( req.query.noheader ? 1 : 0 );
  console.log( 'GET /single/' + id );

  if( db ){
    db.get( id, { include_docs: true }, function( err, doc ){
      if( err ){
        res.render( 'single', { id: id, title: '', body: err, category: '', datetime: '????-??-??', user: null, desc: null, image_url: null } );
      }else{
        res.render( 'single', { id: id, title: doc.title, body: doc.body, category: doc.category, datetime: timestamp2datetime( doc.timestamp ), user: doc.user, desc: ( doc.desc ? doc.desc : '' ), image_url: ( doc.image_url ? doc.image_url : '' ) } );
      }
    });
  }else{
    res.render( 'single', { id: id, title: '', body: 'db is failed to initialize.', category: '', datetime: '????-??-??', user: null, desc: null, image_url: null } );
  }
});

app.get( '/document/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /document/' + id );

  if( db ){
    db.get( id, { include_docs: true }, function( err, doc ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, doc: doc }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/user/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /user/' + id );

  if( db ){
    db.get( id, { include_docs: true }, function( err, user ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        user.password = '********';
        res.write( JSON.stringify( { status: true, user: user }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/attachment/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /attachment/' + id );

  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        //. body._attachments.(attachname) : { content_type: '', data: '' }
        if( body._attachments ){
          for( key in body._attachments ){
            var attachment = body._attachments[key];
            if( attachment.content_type ){
              res.contentType( attachment.content_type );
            }

            //. 添付画像バイナリを取得する
            db.attachment.get( id, key, function( err, buf ){
              if( err ){
                res.contentType( 'application/json; charset=utf-8' );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.end( buf, 'binary' );
              }
            });
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No attachment found.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/docs', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var type = req.query.type;
  var limit = req.query.limit ? parseInt( req.query.limit ) : 0;
  var offset = req.query.offset ? parseInt( req.query.offset ) : 0;
  console.log( 'GET /docs?type=' + type + '&limit=' + limit + '&offset=' + offset );

  if( db ){
    db.list( { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        var docs = [];
        var category = req.query.category ? req.query.category : null;
        body.rows.forEach( function( doc ){
          var _doc = JSON.parse(JSON.stringify(doc.doc));
          if( _doc._id.indexOf( '_' ) !== 0 ){
            if( !type || _doc.type == type ){
              if( type == 'user' ){ _doc.password = '********'; }
              else if( type == 'document' ){ _doc.user.password = '********'; }

              if( !type || type != 'document' || !category || _doc.category == category ){
                docs.push( _doc );
              }
            }
          }
        });

        docs.sort( compareByTimestampRev ); //. 時系列逆順ソート

        if( offset || limit ){
          docs = docs.slice( offset, offset + limit );
        }

        var result = { status: true, docs: docs };
        res.write( JSON.stringify( result, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/searchDocuments', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /searchDocuments' );
  /*
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
      */
        if( db ){
          var q = req.query.q;
          if( q ){
            db.search( 'documents', 'newSearch', { q: q, include_docs: true }, function( err, body ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.write( JSON.stringify( { status: true, docs: body }, 2, null ) );
                res.end();
              }
            });
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
            res.end();
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
  /*
      }
    });
  }
  */
});


//. ここより上で定義する API には認証フィルタをかけない
//. ここより下で定義する API には認証フィルタをかける
app.use( function( req, res, next ){
  if( req.session && req.session.token ){
    //. トークンをデコード
    var token = req.session.token;
    if( !token ){
      return res.status( 403 ).send( { status: false, result: 'No token provided.' } );
    }

    jwt.verify( token, app.get( 'superSecret' ), function( err, decoded ){
      if( err ){
        return res.json( { status: false, result: 'Invalid token.' } );
      }

      req.decoded = decoded;
      next();
    });
  }else{
    return res.status( 403 ).send( { status: false, result: 'No token provided.' } );
  }
});


app.post( '/document', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /document' );
  //console.log( req.body );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          var doc = req.body;
          if( doc.status && typeof doc.status == 'string' ){
            doc.status = parseInt( doc.status );
          }
          if( !doc._id ){ doc._id = uuidv1(); }
          if( doc.user && doc.user._id != user._id && user.role > 0 ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'No permission.' }, 2, null ) );
            res.end();
          }else{
            doc.user = user;
            doc.timestamp = ( new Date() ).getTime();
            if( validateDocType( doc ) ){
              db.insert( doc, function( err, body ){ //. insert/update
                if( err ){
                  //console.log( err ); //. Error: Document id must not be empty
                  res.status( 400 );
                  res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                  res.end();
                }else{
                  res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
                  res.end();
                }
              });
            }else{
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: 'Invalid doc.type' }, 2, null ) );
              res.end();
            }
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.post( '/user', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /user' );
  //console.log( req.body );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          var doc = req.body;
          if( user.role > 0 ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'No permission.' }, 2, null ) );
            res.end();
          }else{
            doc.timestamp = ( new Date() ).getTime();
            if( validateDocType( doc ) ){
              generateHash( doc.password ).then( function( value ){
                doc.password = value;
                db.insert( doc, function( err, body ){ //. insert
                  if( err ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
                    res.end();
                  }
                });
              });
            }else{
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: 'Invalid doc.type' }, 2, null ) );
              res.end();
            }
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.post( '/attachment', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /attachment' );

  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        var filepath = req.file.path;
        var filetype = req.file.mimetype;
        var filename = req.file.originalname;
        var ext = filetype.split( "/" )[1];
        var name = req.body.name;
        var body = req.body.body;

        if( filename && filepath ){
          var bin = fs.readFileSync( filepath );
          var bin64 = new Buffer( bin ).toString( 'base64' );
          var doc = {
            _id: uuidv1(),
            type: 'attachment',
            filename: filename,
            timestamp: ( new Date() ).getTime(),
            name: name,
            body: body,
            user: user,
            _attachments: {
              file: {
                content_type: filetype,
                data: bin64
              }
            }
          };

          if( validateDocType( doc ) ){
            db.insert( doc, function( err, body ){ //. insert only
              if( err ){
                console.log( err );
                fs.unlink( filepath, function( err ){} );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                //console.log( body );
                fs.unlink( filepath, function( err ){} );
                res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
                res.end();
              }
            });
          }else{
            fs.unlink( filepath, function( err ){} );
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'Invalid doc.type' }, 2, null ) );
            res.end();
          }
        }else{
          if( filepath ){ fs.unlink( filepath, function( err ){} ); }
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No name or No file' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});




app.delete( '/document/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /document/' + id );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        db.get( id, function( err, doc ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            if( !doc.user || !doc.user._id ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: 'Could not find owner.' }, 2, null ) );
              res.end();
            }else{
              if( doc.user.role == 0 || doc.user._id == user._id ){
                db.destroy( id, doc._rev, function( err, body ){
                  if( err ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true }, 2, null ) );
                    res.end();
                  }
                });
              }else{
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: 'No permission.' }, 2, null ) );
                res.end();
              }
            }
          }
        });
      }
    });
  }
});

app.delete( '/user/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /user/' + id );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        db.get( id, function( err, user ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            if( user.role == 0 ){
              if( doc.role === 0 ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: 'No permission.' }, 2, null ) );
                res.end();
              }else{
                db.destroy( id, doc._rev, function( err, body ){
                  if( err ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true }, 2, null ) );
                    res.end();
                  }
                });
              }
            }else{
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: 'No permission.' }, 2, null ) );
              res.end();
            }
          }
        });
      }
    });
  }
});

app.delete( '/attachment/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /attachment/' + id );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        db.get( id, function( err, data ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            db.destroy( id, data._rev, function( err, body ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.write( JSON.stringify( { status: true }, 2, null ) );
                res.end();
              }
            });
          }
        });
      }
    });
  }
});


app.get( '/searchUsers', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /searchUsers' );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          var q = req.query.q;
          if( q ){
            db.search( 'users', 'newSearch', { q: q }, function( err, body ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.write( JSON.stringify( { status: true, result: body }, 2, null ) );
                res.end();
              }
            });
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
            res.end();
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.get( '/searchAttachments', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /searchAttachments' );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          var q = req.query.q;
          if( q ){
            db.search( 'attachments', 'newSearch', { q: q }, function( err, body ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.write( JSON.stringify( { status: true, result: body }, 2, null ) );
                res.end();
              }
            });
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
            res.end();
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});


app.post( '/reset', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /reset' );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else if( user.role > 0 ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Operation not allowed.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          db.list( {}, function( err, body ){
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              var docs = [];
              body.rows.forEach( function( doc ){
                var _id = doc.id;
                if( _id.indexOf( '_' ) !== 0 ){
                  var _rev = doc.value.rev;
                  docs.push( { _id: _id, _rev: _rev, _deleted: true } );
                }
              });
              if( docs.length > 0 ){
                db.bulk( { docs: docs }, function( err ){
                  res.write( JSON.stringify( { status: true, message: docs.length + ' documents are deleted.' }, 2, null ) );
                  res.end();
                });
              }else{
                res.write( JSON.stringify( { status: true, message: 'No documents need to be deleted.' }, 2, null ) );
                res.end();
              }
            }
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});


app.post( '/classify', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /classify' );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( nlc ){
          nlc.listClassifiers( {}, ( err1, body1 ) => {
            if( err1 ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err1 }, 2, null ) );
              res.end();
            }else{
              var classifier_id = null;
              if( body1 && body1.classifiers && body1.classifiers.length ){
                body1.classifiers.forEach( function( classifier ){
                  if( classifier.name == settings.nlc_name ){
                    classifier_id = classifier.classifier_id;
                  }
                });
              }
              if( classifier_id ){
                var params2 = {
                  classifier_id: classifier_id,
                  text: removeHtmlTag( req.body.text )
                };
                nlc.classify( params2, ( err2, body2 ) => {
                  if( err2 ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err2 }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, classes: body2.classes }, 2, null ) );
                    res.end();
                  }
                });
              }else{
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
                res.end();
              }
            }
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.get( '/trainingNLC', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /trainingNLC' );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        //. 現在の classifiers 一覧
        if( nlc ){
          //. http://watson-developer-cloud.github.io/node-sdk/master/classes/naturallanguageclassifierv1.htmlhttp://watson-developer-cloud.github.io/node-sdk/master/classes/naturallanguageclassifierv1.html
          nlc.listClassifiers( {}, ( err1, body1 ) => {
            if( err1 ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err1 }, 2, null ) );
              res.end();
            }else{
              var classifier_id = null;
              if( body1 && body1.classifiers && body1.classifiers.length ){
                body1.classifiers.forEach( function( classifier ){
                  if( classifier.name == settings.nlc_name ){
                    classifier_id = classifier.classifier_id;
                  }
                });
              }
              if( classifier_id ){
                var params2 = { classifier_id: classifier_id };
                nlc.getClassifier( params2, ( err2, body2 ) => {
                  if( err2 ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err2 }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, body: body2 }, 2, null ) );
                    res.end();
                  }
                });
              }else{
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
                res.end();
              }
            }
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.post( '/trainingNLC', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /trainingNLC' );
  //console.log( req.body );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else if( user.role > 0 ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Operation not allowed.' }, 2, null ) );
        res.end();
      }else{
        if( db ){
          db.list( { include_docs: true }, function( err, body ){
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              var docs = [];
              var training_lang = ( settings.nlc_language ? settings.nlc_language : 'en' );
              var training_data = '';
              var training_metadata = '{"language":"' + training_lang + '","name":"' + settings.nlc_name + '"}';
              body.rows.forEach( function( doc ){
                var _doc = JSON.parse(JSON.stringify(doc.doc));
                if( _doc._id.indexOf( '_' ) !== 0 ){
                  if( _doc.type && _doc.type == 'document' ){
                    _doc.body = removeHtmlTag( _doc.body );
                    //docs.push( _doc );
                    docs.push( { category: _doc.category, body: _doc.body } );
                    var line = _doc.body + "," + _doc.category + os.EOL;
                    training_data += line;
                  }
                }
              });

              //. 現在の classifiers 一覧
              if( nlc ){
                //. http://watson-developer-cloud.github.io/node-sdk/master/classes/naturallanguageclassifierv1.htmlhttp://watson-developer-cloud.github.io/node-sdk/master/classes/naturallanguageclassifierv1.html
                nlc.listClassifiers( {}, ( err1, body1 ) => {
                  if( err1 ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err1 }, 2, null ) );
                    res.end();
                  }else{
                    var classifier_id = null;
                    if( body1 && body1.classifiers && body1.classifiers.length ){
                      body1.classifiers.forEach( function( classifier ){
                        if( classifier.name == settings.nlc_name ){
                          classifier_id = classifier.classifier_id;
                        }
                      });
                    }

                    if( classifier_id ){
                      nlc.deleteClassifier( { classifier_id: classifier_id }, ( err2, body1 ) => {
                        if( err2 ){
                          res.status( 400 );
                          res.write( JSON.stringify( { status: false, message: err2 }, 2, null ) );
                          res.end();
                        }else{
                          nlc.createClassifier( params3, ( err3, body3 ) => {
                            if( err3 ){
                              res.status( 400 );
                              res.write( JSON.stringify( { status: false, message: err3 }, 2, null ) );
                              res.end();
                            }else{
                              res.write( JSON.stringify( { status: true, message: body3 }, 2, null ) );
                              res.end();
                            }
                          });
                        }
                      });
                    }else{
                      var params3 = {
                        metadata: new Buffer( training_metadata, 'UTF-8' ),
                        training_data: new Buffer( training_data, 'UTF-8' )
                      };
                      nlc.createClassifier( params3, ( err3, body3 ) => {
                        if( err3 ){
                          res.status( 400 );
                          res.write( JSON.stringify( { status: false, message: err3 }, 2, null ) );
                          res.end();
                        }else{
                          res.write( JSON.stringify( { status: true, message: body3 }, 2, null ) );
                          res.end();
                        }
                      });
                    }
                  }
                });
              }else{
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
                res.end();
              }
            }
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});

app.delete( '/trainingNLC', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'DELETE /trainingNLC' );
  //console.log( req.body );
  var token = ( req.session && req.session.token ) ? req.session.token : null;
  if( !token ){
    res.status( 401 );
    res.write( JSON.stringify( { status: false, result: 'No token provided.' }, 2, null ) );
    res.end();
  }else{
    //. トークンをデコード
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( err ){
        res.status( 401 );
        res.write( JSON.stringify( { status: false, result: 'Invalid token.' }, 2, null ) );
        res.end();
      }else{
        if( nlc ){
          nlc.listClassifiers( {}, ( err1, body1 ) => {
            if( err1 ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err1 }, 2, null ) );
              res.end();
            }else{
              var classifier_id = null;
              if( body1 && body1.classifiers && body1.classifiers.length ){
                body1.classifiers.forEach( function( classifier ){
                  if( classifier.name == settings.nlc_name ){
                    classifier_id = classifier.classifier_id;
                  }
                });
              }

              if( classifier_id ){
                nlc.deleteClassifier( { classifier_id: classifier_id }, ( err2, body2 ) => {
                  if( err2 ){
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err2 }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, body: body2 }, 2, null ) );
                    res.end();
                  }
                });
              }else{
                res.write( JSON.stringify( { status: true, message: 'Not existed.' }, 2, null ) );
                res.end();
              }
            }
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No NLC available.' }, 2, null ) );
          res.end();
        }
      }
    });
  }
});


function deleteDoc( doc_id ){
  console.log( "deleting document: " + doc_id );
  db.get( doc_id, function( err, data ){
    if( !err ){
      db.destroy( id, data._rev, function( err, body ){
      });
    }
  });
}

function validateDocType( doc ){
  var b = false;
  console.log( "validating document: " + doc._id );
  if( doc && doc.type ){
    switch( doc.type ){
    case 'document':
      if( doc.title && doc.body && doc.user && doc.timestamp /* && doc.category */ ){
        b = true;
      }
      break;
    case 'user':
      if( doc._id && doc.password && doc.name && doc.timestamp && doc.email && ( "role" in doc ) ){
        b = true;
      }
      break;
    case 'attachment':
      if( doc.filename && doc.user && doc._attachments && doc.timestamp ){
        b = true;
      }
      break;
    }
  }

  return b;
}

function compareByTimestamp( a, b ){
  var r = 0;
  if( a.timestamp < b.timestamp ){ r = -1; }
  else if( a.timestamp > b.timestamp ){ r = 1; }

  return r;
}

function compareByTimestampRev( a, b ){
  var r = 0;
  if( a.timestamp < b.timestamp ){ r = 1; }
  else if( a.timestamp > b.timestamp ){ r = -1; }

  return r;
}

function createDesignDocuments(){
  //. デザインドキュメント作成

  //. Search Index
  var design_search_doc = {
    _id: "_design/documents",
    language: "javascript",
    views: {
      bytimestamp: {
        map: "function (doc) { if( doc.typestamp && doc.type && doc.type == 'document' ){ emit(doc.timestamp, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": "japanese",
        "index": "function (doc) { index( 'default', [doc.title,doc.category,doc.body].join( ' ' ) ); }"
      }
    }
  };
  db.insert( design_search_doc, function( err, body ){
    if( err ){
      console.log( "db init: err" );
      console.log( err );
    }else{
      //console.log( "db init: " );
      //console.log( body );
    }
  });

  var design_search_user = {
    _id: "_design/users",
    language: "javascript",
    views: {
      bytimestamp: {
        map: "function (doc) { if( doc.typestamp && doc.type && doc.type == 'user' ){ emit(doc.timestamp, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": "japanese",
        "index": "function (doc) { index( 'default', [doc.name,doc.email].join( ' ' ) ); }"
      }
    }
  };
  db.insert( design_search_user, function( err, body ){
    if( err ){
      console.log( "db init: err" );
      console.log( err );
    }else{
      //console.log( "db init: " );
      //console.log( body );
    }
  });

  var design_search_attachment = {
    _id: "_design/attachments",
    language: "javascript",
    views: {
      bytimestamp: {
        map: "function (doc) { if( doc.typestamp && doc.type && doc.type == 'attachment' ){ emit(doc.timestamp, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": "japanese",
        "index": "function (doc) { index( 'default', [doc.name,doc.filename,doc.body].join( ' ' ) ); }"
      }
    }
  };
  db.insert( design_search_attachment, function( err, body ){
    if( err ){
      console.log( "db init: err" );
      console.log( err );
    }else{
      //console.log( "db init: " );
      //console.log( body );
    }
  });

  //. Query Index
  var design_query_doc = {
    _id: "_design/query_doc_by_userid",
    language: "query",
    views: {
      doc_userid_index: {
        map: {
          fields: { "user.id": "asc", "type": "asc" },
          partial_filter_selector: {}
        },
        reduce: "_count",
        options: {
          "def": {
            fields: [ "user.id", "type" ]
          }
        }
      }
    }
  };
  db.insert( design_query_doc, function( err, body ){
    if( err ){
      console.log( "db init query: err" );
      console.log( err );
    }else{
      //console.log( "db init query: " );
      //console.log( body );
    }
  });
}

function generateHash( data ){
  return new Promise( function( resolve, reject ){
    if( data ){
      //. hash 化
      var sha512 = crypto.createHash( 'sha512' );
      sha512.update( data );
      var hash = sha512.digest( 'hex' );
      resolve( hash );
    }else{
      resolve( null );
    }
  });
}

function timestamp2datetime( ts ){
  var dt = new Date( ts );
  var yyyy = dt.getFullYear();
  var mm = dt.getMonth() + 1;
  var dd = dt.getDate();
  var hh = dt.getHours();
  var nn = dt.getMinutes();
  var ss = dt.getSeconds();
  var datetime = yyyy + '-' + ( mm < 10 ? '0' : '' ) + mm + '-' + ( dd < 10 ? '0' : '' ) + dd
    + ' ' + ( hh < 10 ? '0' : '' ) + hh + ':' + ( nn < 10 ? '0' : '' ) + nn + ':' + ( ss < 10 ? '0' : '' ) + ss;
  return datetime;
}

function removeHtmlTag( html ){
  var text = html.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g,'');
  text = text.split(',').join('');
  return text;
}


var port = settings.app_port || appEnv.port || 3000;
app.listen( port );
console.log( 'server started on ' + port );
