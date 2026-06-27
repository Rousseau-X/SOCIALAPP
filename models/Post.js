const mongoose = require("mongoose")

const postSchema = new mongoose.Schema({
    auteur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    contenu: {
    type: String,
    required: false,
    default: "",
    maxlength: 1000
},
    image: {
        type: String,
        default: null
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    commentaires: [{
        auteur: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        texte: {
            type: String,
            maxlength: 300
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],

    // === PARTAGE ===
    isShared: {
        type: Boolean,
        default: false
    },
    sharedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
        default: null
    },
    shareMessage: {
        type: String,
        default: "",
        maxlength: 300
    },
    sharesCount: {
        type: Number,
        default: 0
    },

    // === ÉPINGLÉ ===
    isPinned: {
        type: Boolean,
        default: false
    }

}, { timestamps: true })

// ============================================================
// INDEXES — feed, profil, likes
// ============================================================
postSchema.index({ auteur: 1, createdAt: -1 })   // posts d'un utilisateur
postSchema.index({ createdAt: -1 })               // feed global
postSchema.index({ likes: 1 })                    // requêtes "liké par"
postSchema.index({ isPinned: 1, auteur: 1 })      // post épinglé

module.exports = mongoose.models.Post || mongoose.model("Post", postSchema)
