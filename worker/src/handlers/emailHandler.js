const logger = require('../config/logger');

class EmailHandler {
  async execute(payload) {
    logger.info(`Sending email to: ${payload.to}`);
    
    // Simulate email sending
    await this.delay(2000);
    
    // Simulate 10% failure rate for testing
    if (Math.random() < 0.1) {
      throw new Error('SMTP server temporarily unavailable');
    }

    logger.info(`Email sent successfully to: ${payload.to}`);
    
    return {
      success: true,
      messageId: `msg-${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new EmailHandler();