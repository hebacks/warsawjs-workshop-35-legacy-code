import express from 'express'
import bodyParser from 'body-parser'
import passport from 'passport'
import session from 'express-session'
import { Strategy } from 'passport-local'
import path from 'path'
import Knex from 'knex'
import fs from 'fs'

var knex = Knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, '../database/db.sqlite')
  },
  migrations: {
    directory: path.join(__dirname, '../database/migrations')
  },
  useNullAsDefault: true,
})

knex.migrate.latest()

passport.use(new Strategy(
  async function (username, password, done) {
    try {
      var user = await knex('users')
        .first('username', 'password')
        .where({ username: username })
      if (!user || (password !== user.password)) {
        return done(null, false)
      }
      return done(null, user)
    } catch (error) {
      done(error)
    }
  }
))

passport.serializeUser(function (user, done) {
  done(null, user.username)
})

passport.deserializeUser(async function (username, done) {
  try {
    var user = await knex('users')
      .first('username', 'password')
      .where({ username: username })
    if (!user) {
      done(new Error('User not found'))
    } else {
      done(null, user)
    }
  } catch (error) {
    done(error)
  }
})

var app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'static')))
app.use(session({
  secret: 'P!NZ',
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())

app.get('/login', function (req, res) {
  var error = +req.query.error
  res.status(200).render('login', {
    username: undefined,
    error: error
  })
})

app.get('/signup', function (req, res) {
  var error = +req.query.error
  res.status(200).render('signup', {
    username: undefined,
    error: error
  })
})

app.post('/signup', async function (req, res, next) {
  var correct = 0
  var i
  var passwords
  var user
  var username = req.body.username
  var password = req.body.password
  try {
    if (password === '' || !/^[a-z0-9\-_]{3,20}$/.test(username)) {
      res.redirect('/signup?error=2')
    } else {
      passwords = fs.readFileSync(
        path.join(__dirname, '../config/weakpasswords.txt'),
        'utf-8'
      )
      for (i = 0; i < passwords.length; i++) {
        if (password === passwords[i]) {
          correct = 1
        }
      }
      if (password.length <= 6) {
        correct = 1
      }
      try {
        if (correct) {
          res.redirect('/signup?error=3')
        } else {
          correct = 2
          user = { username: username, password: password }
          try {
            await knex('users').insert(user)
          } catch (e) {
            if (e instanceof Error && /users\.username/.test(e.message)) {
              throw new Error('User already exists')
            }
            throw e
          }
          await new Promise(function (resolve, reject) {
            req.logIn(user, function (err) {
              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })
          })
          res.redirect('/')
        }
      } catch (e) {
        if (e && e.message === 'User already exists') {
          res.redirect('/signup?error=1')
        } else {
          throw e
        }
      }
    }
  } catch (e) {
    next(e)
  }
})

app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login?error=1'
}))

app.post('/logout', function (req, res) {
  req.logout()
  res.redirect('/')
})

app.get('/', function (req, res) {
  res.redirect('/best')
})

app.get('/best', async function (req, res, next) {
  try {
    var pins = await knex('pins')
      .select('pins.id', 'pins.username', 'pins.url')
      .count('likes.pinId as likes')
      .leftJoin('likes', 'pins.id', 'likes.pinId')
      .groupBy('pins.id', 'pins.username', 'pins.url')
      .orderBy('likes', 'desc')
      .limit(48)
    res.status(200).render('pins', {
      username: req.user && req.user.username,
      title: 'Best',
      linkUrl: '',
      linkTitle: '',
      pins: pins
    })
  } catch (e) {
    next(e)
  }
})

app.get('/users/:username/pins', async function (req, res, next) {
  try {
    res.render('pins', {
      username: req.user && req.user.username,
      title: req.params.username + '’s pins',
      linkUrl: '/users/' + req.params.username + '/likes',
      linkTitle: req.params.username + '’s likes',
      pins: await knex('pins')
        .select('pins.id', 'pins.username', 'pins.url')
        .count('likes.pinId as likes')
        .leftJoin('likes', 'pins.id', 'likes.pinId')
        .groupBy('pins.id', 'pins.username', 'pins.url')
        .orderBy('pins.id', 'desc')
        .where('pins.username', req.params.username),
    })
  } catch (e) {
    next(e)
  }
})

app.get('/users/:username/likes', async function (req, res, next) {
  try {
    res.render('pins', {
      username: req.user && req.user.username,
      title: req.params.username + '’s likes',
      linkUrl: '/users/' + req.params.username + '/pins',
      linkTitle: req.params.username + '’s pins',
      pins: await knex('pins')
        .select('pins.id', 'pins.username', 'pins.url')
        .count('likes.pinId as likes')
        .leftJoin('likes', 'pins.id', 'likes.pinId')
        .groupBy('pins.id', 'pins.username', 'pins.url')
        .orderBy('pins.id', 'desc')
        .join('likes as x', 'pins.id', 'x.pinId')
        .where('x.username', req.params.username),
    })
  } catch (e) {
    next(e)
  }
})

app.post('/pins', async function (req, res, next) {
  try {
    if (!req.user) {
      res.redirect('/login')
    } else {
      if (!req.body.url) {
        throw new Error('No url')
      }
      var id = await knex('pins')
        .insert({ username: req.user.username, url: req.body.url })
        .returning('id')
      res.redirect('/pins/' + id)
    }
  } catch (e) {
    next(e)
  }
})

app.post('/pins/:id/likes', async function (req, res, next) {
  try {
    if (!req.user) {
      res.redirect('/login')
    }
    try {
      await knex('likes').insert({ pinId: +req.params.id, username: req.user.username })
      res.redirect('/pins/' + req.params.id)
    } catch {
      res.redirect('/pins/' + req.params.id + 'error=1')
    }
  } catch (e) {
    next(e)
  }
})

app.get('/pins/:id', async function (req, res, next) {
  try {
    var error = +req.query.error
    var pin = await knex('pins')
      .first('pins.id', 'pins.username', 'pins.url')
      .count('likes.pinId as likes')
      .where('pins.id', +req.params.id)
      .leftJoin('likes', 'pins.id', 'likes.pinId')
      .groupBy('pins.id', 'pins.username', 'pins.url')
    if (pin) {
      res.status(200).render('pin', {
        username: req.user && req.user.username,
        title: 'Pin #' + req.params.id,
        pin: pin,
        error: error
      })
    } else {
      res.status(404).render('404', {
        username: req.user && req.user.username,
        title: 'Pin #' + req.params.id + ' not found'
      })
    }
  } catch (e) {
    next(e)
  }
})

app.use(function (req, res) {
  res.status(404).render('404', {
    username: req.user && req.user.username,
    title: 'Not Found',
  })
})

app.listen(8080)

console.log('Listening')
