const yaml = require('js-yaml');
const visitor = require('probot-visitor');
const Freeze = require('./lib/freeze');
const formatParser = require('./lib/format-parser');
const githubHelper = require('./lib/github-helper');

/* Configuration Variables */

module.exports = robot => {
  robot.on('integration_installation.added', config);
  robot.on('issue_comment', handleFreeze);
  const visit = visitor(robot, {interval: 60 * 5 * 1000}, handleThaw);

  async function config(event) {
    const freeze = await forRepository(context.github, event.payload.repository);

    context.github.issues.getLabel(context.repositories_added[0]({
      name: freeze.labelName}).catch(() => {
        return context.github.issues.createLabel(context.repositories_added[0]({
          name: freeze.config.labelName,
          color: freeze.config.labelColor
        }));
      }));
  }

  async function handleFreeze(event, context) {
    const freeze = await forRepository(context.github, event.payload.repository);
    const comment = event.payload.comment;
    if (freeze.config.perform && !context.isBot && freeze.freezable(comment)) {
      freeze.freeze(
        context,
        freeze.propsHelper(context.event.payload.comment.user.login, comment.body)
    );
    }
  }

  async function handleThaw(installation, repository) {
    const github = await robot.auth(installation.id);
    const freeze = await forRepository(github, repository);

    const frozenIssues = await github.search.issues({q:'label:' + freeze.config.labelName});
    await Promise.all(frozenIssues.items.map(async issue => {
      const issueObj = githubHelper.commentUrlToIssueRequest(issue.comments_url);
      github.issues.getComments(issueObj).then(comments => {
        const comment = freeze.getLastFreeze(comments);
        if (comment !== null && freeze.unfreezable(comment)) {
          console.log('unfreezable!!');
          freeze.unfreeze(issue, formatParser.propFromComment(comment.body));
        }
        console.log('post test');
      });
    }));
  }

  async function forRepository(github, repository) {
    const owner = repository.owner.login;
    const repo = repository.name;
    const path = '.github/probot-freeze.yml';
    let config = {};

    try {
      const data = await github.repos.getContent({owner, repo, path});
      config = yaml.load(new Buffer(data.content, 'base64').toString()) || {};
      config = Object.assign(config, {perform:true});
    } catch (err) {
      visit.stop(repository);
    }

    config = Object.assign(config, {owner, repo, logger: robot.log});

    return new Freeze(github, config);
  }
};
