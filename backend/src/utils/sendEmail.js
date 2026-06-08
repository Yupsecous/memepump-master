
const nodeMailer = require("nodemailer");

/* Using Hostinger Mail */
const transporter = nodeMailer.createTransport({
    host: "smtp.hostinger.com",
    secure: true,
    secureConnection: false,
    tls: {
       ciphers: "SSLv3",
    },
    requireTLS: true,
    port: 465,
    debug: true,
    connectionTimeout: 10000,
    auth: {
        user: process.env.HOSTINGER_EMAIL,
        pass: process.env.HOSTINGER_PASSWORD,
    }
});

const sendEmail = async (options, callback) => {
	const mailOptions = {
	    from: process.env.HOSTINGER_EMAIL,
	    to: options.to,
	    subject: options.subject,
	    html: options.html
	};
    
    return transporter.sendMail(mailOptions).then(info => {
        if (callback)
            callback(null, info.response);
    })
    .catch(err => {
        if (callback)
            callback(err);
    });
};

module.exports = sendEmail;
