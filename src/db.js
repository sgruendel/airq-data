'use strict';

const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/airq-data');

var exports = (module.exports = {});

exports.disconnect = mongoose.disconnect;

const data = new mongoose.Schema(
    {
        device_id: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            required: true,
        },
        dateutc: {
            type: Date,
            required: true,
        },
    },
    {
        autoCreate: true,
        strict: false,
        timestamps: true,
    },
);
data.index({ status: 1 });
data.index({ dateutc: -1 });
exports.Data = mongoose.model('Data', data);
