const Tweet = require('../shared/tweet');
const { whoami, reply } = require('../shared/twitter');
const twitter = require('../shared/twitter');

const BOT_HANDLE = '@captions_please';
let my_id = null;

const do_nothing = (context) => {
  context.res = {
    status: 200,
  };
  context.done();
};

const respond_no_photos = (context, tweet, has_invalid_media) => {
  context.log.info('No photos to parse, early return');
  // Even on failure, we'll respond 200, as there's nothing to retry here
  context.res = {
    status: 200,
  };
  const message = has_invalid_media
    ? 'I only know how to decode photos, not gifs or videos. Sorry!'
    : "I didn't find any photos to decode, but I appreciate the shoutout!";
  return twitter.reply(tweet.id(), message);
};

module.exports = async (context, req) => {
  if (!req.body.tweet_create_events) {
    context.log.info('No body, early return');
    return do_nothing(context);
  }

  context.log('New webhook request:\n' + JSON.stringify(req.body, null, 2));

  const tweet = new Tweet(req.body.tweet_create_events[0]);
  if (!tweet.is_tweet() && !tweet.is_reply() && !tweet.is_quote_tweet()) {
    context.log.info('Not a tweet or reply, early return');
    return do_nothing(context);
  }

  if (!tweet.explicitly_contains_handle(BOT_HANDLE)) {
    context.log.info('Not mentioned in the body message, early return');
    return do_nothing(context);
  }

  if (!my_id) {
    my_id = await whoami();
    context.log.info('Getting the bot id of ' + my_id);
  }

  if (tweet.id() == my_id) {
    context.log.info('Author is myself, early return');
    return do_nothing(context);
  }

  let parent_tweet = null;
  if (!tweet.has_photos()) {
    if (tweet.is_quote_tweet()) {
      parent_tweet = new Tweet(tweet.data.quoted_status);
    } else {
      parent_tweet = await tweet.get_parent_tweet();
    }
    context.log.info(
      'Parent tweet is: ' + JSON.stringify(parent_tweet, null, 2)
    );

    if (!parent_tweet || !parent_tweet.has_photos()) {
      const has_invalid_media =
        tweet.has_media() || (parent_tweet && parent_tweet.has_media());
      return respond_no_photos(context, tweet, has_invalid_media);
    }
  }
  const tweet_to_scan = parent_tweet || tweet;

  const item = {
    to_reply_id: tweet.id(),
    media: tweet_to_scan.get_photos(),
  };
  context.log('Placing the message on the queue for parsing');
  context.log(item);
  context.bindings.imageQueue = JSON.stringify(item);
  return do_nothing(context);
};
