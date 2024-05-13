require('dotenv').config();
const express = require('express');
const GitHubStrategy = require('passport-github').Strategy;
const passport = require('passport');
const session = require('express-session');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Replicate = require('replicate');
const path = require('path');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/myapp', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

// User schema
const Schema = mongoose.Schema;
const userSchema = new Schema({
    githubId: String,
    username: String,
    email: String,
});
const User = mongoose.model('User', userSchema);

// Passport setup
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: 'https://integrating-ai.onrender.com/auth/github/callback'
  },
  async function(accessToken, refreshToken, profile, cb) {
    let user = await User.findOne({ githubId: profile.id });
    if (!user) {
      user = new User({
        githubId: profile.id,
        username: profile.username,
        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null
      });
      await user.save();
    }
    return cb(null, user);
  }
));

passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(async function(id, cb) {
  try {
    const user = await User.findById(id);
    cb(null, user);
  } catch (error) {
    cb(error, null);
  }
});

// Express app setup
const app = express();
const port = process.env.PORT || 3000;

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Middleware to check if user is authenticated
const isAuth = (req, res, next) => {
  if (req.user) {
    next();
  } else {
    req.session.returnTo = req.originalUrl;
    res.redirect('/signin');
  }
};

// Routes
app.get('/', isAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/signin', (req, res) => {
  req.session.returnTo = req.query.returnTo || '/';
  if (req.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'signin.html'));
});

app.get('/logout', (req, res) => {
  req.logOut();
  res.redirect('/signin');
});

// Authentication routes
app.get('/auth/github', passport.authenticate('github'));

app.get(
  '/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/signin' }),
  function (req, res) {
    res.redirect(req.session.returnTo || '/');
    delete req.session.returnTo;
  }
);

// Replicate setup
const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

// Replicate routes with authentication middleware
app.post('/generate-image', isAuth, async (req, res) => {
  const { prompt } = req.body;
  try {
    const output = await replicate.run(
      "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
      {
        input: {
          width: 768,
          height: 768,
          prompt: prompt,
          scheduler: "K_EULER",
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 50
        }
      }
    );

    // Log the entire output object for debugging
    console.log('Output object:', output);

    // Check if the output contains a valid URL
    if (output) {
      // Send the URL in the response
      res.json({ success: true, imageUrl: output });
    } else {
      // Log an error if the URL is not found
      console.error('Image URL not found in the response:', output);
      res.status(500).json({ success: false, error: 'Failed to generate image' });
    }
  } catch (error) {
    // Log and handle any errors that occur during image generation
    console.error('Error generating image:', error);
    res.status(500).json({ success: false, error: 'Failed to generate image' });
  }
});

app.post('/generate-video', isAuth, async (req, res) => {
  const { prompt } = req.body;
  try {
    const output = await replicate.run(
      "cjwbw/damo-text-to-video:1e205ea73084bd17a0a3b43396e49ba0d6bc2e754e9283b2df49fad2dcf95755",
      {
        input: {
          fps: 8,
          prompt: prompt,
          num_frames: 50,
          num_inference_steps: 50
        }
      }
    );

    // Log the entire output object for debugging
    console.log('Output object:', output);

    // Check if the output contains a valid URL
    if (output) {
      // Send the URL in the response
      res.json({ success: true, videoUrl: output });
    } else {
      // Log an error if the URL is not found
      console.error('Video URL not found in the response:', output);
      res.status(500).json({ success: false, error: 'Failed to generate image' });
    }
  } catch (error) {
    // Log and handle any errors that occur during image generation
    console.error('Error generating image:', error);
    res.status(500).json({ success: false, error: 'Failed to generate image' });
  }
});

app.post('/generate-audio', isAuth, async (req, res) => {
  const { prompt } = req.body;
  try {
    const output = await replicate.run(
      "haoheliu/audio-ldm:b61392adecdd660326fc9cfc5398182437dbe5e97b5decfb36e1a36de68b5b95",
      {
        input: {
          text: prompt,
          duration: "5.0",
          n_candidates: 3,
          guidance_scale: 2.5
        }
      }
    );

    // Log the entire output object for debugging
    console.log('Output object:', output);

    // Check if the output contains a valid URL
    if (output) {
      // Send the URL in the response
      res.json({ success: true, audioUrl: output });
    } else {
      // Log an error if the URL is not found
      console.error('Audio URL not found in the response:', output);
      res.status(500).json({ success: false, error: 'Failed to generate audio' });
    }
  } catch (error) {
    // Log and handle any errors that occur during audio generation
    console.error('Error generating audio:', error);
    res.status(500).json({ success: false, error: 'Failed to generate audio' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
