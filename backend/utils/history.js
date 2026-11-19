const User = require("../models/User");

const MAX_HISTORY = 200;
const DUPLICATE_WINDOW_MS = 60 * 1000;

/* Ghi một lần khám phá vào lịch sử người dùng (bỏ qua nếu trùng trong 1 phút) */
async function recordVisit(user, destinationId, source = "random") {
    if (!user || !destinationId) return;

    const last = user.history[user.history.length - 1];
    if (
        last &&
        String(last.destination) === String(destinationId) &&
        Date.now() - new Date(last.visitedAt).getTime() < DUPLICATE_WINDOW_MS
    ) {
        return;
    }

    await User.updateOne(
        { _id: user._id },
        {
            $push: {
                history: {
                    $each: [{ destination: destinationId, source, visitedAt: new Date() }],
                    $slice: -MAX_HISTORY
                }
            }
        }
    );
}

module.exports = { recordVisit };
