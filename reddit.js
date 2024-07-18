
let redditFiles = [];
let after;
let baseUrl;

export async function startReddit() {
    addSubreddit();
    let subreddits = [];
    for (const redditElem of document.getElementsByClassName("pickedSubreddit")) {
        subreddits.push(redditElem.innerText.trim())
    }
    if (subreddits.length == 0) {
        return false;
    }
    const sort = document.getElementById("redditSort").value;
    const time = document.getElementById("redditTime").value
    baseUrl = "https://old.reddit.com/r/"
    baseUrl += subreddits.join("+") + "/"
    baseUrl += sort + "/"
    baseUrl += ".json"
    baseUrl += "?t=" + time
    saveProfile(subreddits, sort, time);
    await loadNextPage()
    return true
}

let isLoading = false;

async function loadNextPage() {
    if (isLoading) {
        return
    }
    isLoading = true;
    let url = baseUrl + (after ? "&after=" + after : "")
    const response = await fetch(url)
    const jsonResp = await response.json()
    let metadataPromises = []
    after = jsonResp.data.after
    for (let child of jsonResp.data.children) {
        if (child.data.stickied) {
            continue;
        }
        if (child.data.gallery_data) {
            for (let gallery_child of child.data.gallery_data.items) {
                const mediaId = gallery_child.media_id
                const media = child.data.media_metadata[mediaId]
                if (media) {
                    if (media.m.indexOf("image") === 0) {
                        let fileEnding = media.m.split("/")[1]
                        redditFiles.push({type: 'short', url: 'https://i.redd.it/' + media.id + '.' + fileEnding, format: 'image', width: media.s.x, height: media.s.y})
                    }
                }
            }
        } else if (child.data.media_embed && child.data.media_embed.content) {
            let elem = document.createElement("div")
            elem.innerHTML = child.data.media_embed.content
            const decoded = elem.innerText
            redditFiles.push({type: 'iframe', html: decoded, height: child.data.media_embed.height, width: child.data.media_embed.width})
        } else if (child.data.url && /\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff)$/i.test(child.data.url)) {
            const imgObj = {type: 'short', url: child.data.url, format: 'image'}
            if (child.data.preview && child.data.preview.images && child.data.preview.images[0].source) {
                imgObj.width = child.data.preview.images[0].source.width
                imgObj.height = child.data.preview.images[0].source.height
            } else {
                metadataPromises.push(loadImageMetadata(imgObj));
            }
            redditFiles.push(imgObj)
        }
    }
    await Promise.all(metadataPromises)
    isLoading = false
}

function loadImageMetadata(imgObj) {
    let img = new Image();

    img.onload = async function() {
        imgObj.width = img.width
        imgObj.height = img.height
        resolve()
    };
    img.onerror = async function(e) {
        console.error(e)
        imgObj.width = 1
        imgObj.height = 1
        resolve()
    }

    img.src = imgObj.url
}

function scaleWidth(fitHeight, height, width) {
    let scaleFactor = fitHeight/height
    return width * scaleFactor
}

export async function nextRedditSlides(remainingWidth, height, isEmpty) {
    let toAdd = [];
    let newRemainingWidth = remainingWidth;
    let indicesToRemove = [];
    for (let i = 0; i < redditFiles.length && i < 10; i++) {
        let scaledWidth = scaleWidth(height, redditFiles[i].height, redditFiles[i].width)
        redditFiles[i].scaledWidth = scaledWidth
        if (scaledWidth < newRemainingWidth) {
            toAdd.push(redditFiles[i])
            indicesToRemove.push(i)
            newRemainingWidth -= scaledWidth
        }
    }
    if (isEmpty && toAdd.length === 0) {
        let scaledHeight = scaleWidth(remainingWidth, redditFiles[0].width, redditFiles[0].height)
        let scaledWidth = scaleWidth(scaledHeight, redditFiles[0].height, redditFiles[0].width)
        redditFiles[0].scaledWidth = scaledWidth;
        toAdd.push(redditFiles[0])
        indicesToRemove.push(0)
    }
    for (const i of indicesToRemove.reverse()) {
        redditFiles.splice(i, 1)
    }
    if (redditFiles.length < 10) {
        loadNextPage()
    }
    return toAdd
}

let subredditInput;
let pickedSubreddits;
let redditTimeContainer;
let profileTextInput;
let profilePicker;

function addSubreddit() {
    const val = subredditInput.value
    if (val.trim() != "") {
        addSubredditValue(val)
        subredditInput.value = ""
    }
}

function addSubredditValue(subredditName) {
    const divElem = document.createElement("div");
    divElem.innerHTML = '<span class="pickedSubreddit">' + subredditName + "</span> <button>Remove</button>";
    divElem.getElementsByTagName("button")[0].onclick = function() { pickedSubreddits.removeChild(divElem) }
    pickedSubreddits.appendChild(divElem)
}

function changeSort() {
    const val = document.getElementById("redditSort").value
    if (val == "top" || val == "controversial") {
        redditTimeContainer.style.display = "flex"
    } else {
        redditTimeContainer.style.display = "none"
    }
}

function setSelectValue(selectElement, value) {
    for (const child of selectElement.children) {
        if (child.value == value) {
            child.setAttribute("selected", "selected")
        } else {
            child.removeAttribute("selected")
        }
    }
}

function profileChanged(event) {
    const profileName = event.target.value.trim()
    if (profileName == "__create") {
        document.getElementById("profileInput").style.display = "flex"
    } else {
        document.getElementById("profileInput").style.display = "none"
    }
    if (profileName.indexOf("__") == -1) {
        const redditProfiles = JSON.parse(localStorage.getItem("redditProfiles"))
        const profile = redditProfiles.filter(prof => prof.name == profileName)[0]
        setSelectValue(document.getElementById("redditSort"), profile.sort)
        changeSort()
        setSelectValue(document.getElementById("redditTime"), profile.time)
        pickedSubreddits.innerHTML = ""
        profile.subreddits.forEach(addSubredditValue)
    }
}

function saveProfile(subreddits, sort, time) {
    const name = profilePicker.value == "__create" ? profileTextInput.value.trim() : profilePicker.value.trim()
    if (name != '__none' && name != '') {
        let profilesString = localStorage.getItem("redditProfiles") || "[]"
        let profiles = JSON.parse(profilesString).filter(prof => prof.name != name)
        profiles.push({
            name,
            subreddits,
            sort,
            time
        })
        localStorage.setItem("redditProfiles", JSON.stringify(profiles))
    }
}

function fillProfiles() {
    const redditProfileString = localStorage.getItem("redditProfiles")
    if (redditProfileString) {
        const redditProfileNames = JSON.parse(redditProfileString).map(prof => prof.name)
        for (const profileName of redditProfileNames) {
            const option = document.createElement("option")
            option.setAttribute("value", profileName)
            option.innerText = profileName
            profilePicker.appendChild(option)
        }
    }
}

export function initReddit() {
    pickedSubreddits = document.getElementById("pickedSubreddits")
    subredditInput = document.getElementById("subredditInput")
    subredditInput.onkeydown = function(e) { if (e.code == 'Enter') { addSubreddit() } }
    document.getElementById("subredditAdd").onclick = addSubreddit

    redditTimeContainer = document.getElementById("redditTimeContainer")
    document.getElementById("redditSort").onchange = changeSort

    profileTextInput = document.getElementById('profileNameInput')
    profilePicker = document.getElementById('profilePicker')
    profilePicker.onchange = profileChanged
    fillProfiles()
}