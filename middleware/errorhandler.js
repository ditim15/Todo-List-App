// Catches errors passed to next(err). Must always send a response; otherwise the
// request hangs and the client waits forever.
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({
        message: "Something went wrong on the server"
    });
}

export default errorHandler;
