import { initSettings, settings } from './settings.js';
import { showPicker, loadFiles, nextFileSlides, current, total } from './localFiles.js';
import { startReddit, nextRedditSlides, initReddit } from './reddit.js';

let inProgress = false;
let animationInterval;
let slidesFetcher;

function animateBucket() {
    let path = document.getElementById("path")
    let time = 0.0
    animationInterval = setInterval(() => {
        time += 0.1
        let height = (current/total)*140 + 30
        let startY = 200 - height
        let startHeight = startY + Math.sin(time)*20
        let leftDistToBottom = 170 - startHeight
        let endHeight = startY + Math.cos(time)*20
        let rightDistToTop = 170 - endHeight
        let y1 = Math.sin(time*2 + 3*Math.PI/4)*30 + startY
        let y2 = Math.sin(time*2 + Math.PI/4)*30 + startY
        path.setAttribute('d', 'm0,' + startHeight + ' v' + leftDistToBottom + ' C0 180 90 180 90 170 v-' + rightDistToTop + ' C60 ' + y1 + ' 30 ' + y2 + ' 0 ' + startHeight + ' z')
    }, 33)
}

async function openDir2() {
    try {
        const folder = await showPicker()
        for (const e of document.getElementsByClassName("titleContent")) {
            e.style.display = 'none'
        }
        document.getElementById("load-container").style.display = 'block'
        document.getElementById("menu-tip").style.display = 'none'
        animateBucket()
        await loadFiles(folder)
        inProgress = true
        slidesFetcher = nextFileSlides
        for (const e of document.getElementsByClassName("slideshow-row")) {
            await startSlideShow(e)
        }
        if (animationInterval) {
            clearInterval(animationInterval)
        }
    } catch(e) {
        console.log(e)
    }
}

async function openReddit() {
    if(await startReddit()) {
        for (const e of document.getElementsByClassName("titleContent")) {
            e.style.display = 'none'
        }
        document.getElementById("menu-tip").style.display = 'none'
        inProgress = true
        slidesFetcher = nextRedditSlides
        for (const e of document.getElementsByClassName("slideshow-row")) {
            await startSlideShow(e)
        }
    }
}

function jitter(num) {
    let amount = Math.random()*(num*0.4) - num*0.2
    return num + amount
}

function replaceSlide(parent, newElem, oldElem, newWidth){
    let oldWidth;
    if (oldElem && Array.prototype.indexOf.call(parent.children, oldElem) >= 0) {
        oldWidth = oldElem.offsetWidth
        newElem.style.width = oldWidth
        parent.replaceChild(newElem, oldElem)
        if (oldElem.dataset.isObject) {
            URL.revokeObjectURL(oldElem.src)
        }
    } else {
        oldWidth = 0
        parent.appendChild(newElem)
    }
    newElem.setAttribute("data-real-width", newWidth)
    newElem.animate([
        { width: oldWidth + "px" },
        { width: newWidth + "px" }
    ], 500)
}

async function startSlideShow(root) {
    
    document.getElementById("welcome").style.display = 'none';
    document.getElementById("slideshow-grid").style.display = 'flex';
    for(const elem of document.getElementsByClassName("slideshow-row")) {
        elem.style.display = 'flex';
    }
    let debounceTimer;
    let toRemove = [];

    async function loadMoreSlides() {
        let removedWidth = 0;
        for(const e of toRemove) {
            removedWidth += e.offsetWidth
        }
        let childrenWidth = 0;
        for (const child of root.children) {
            childrenWidth += parseInt(child.dataset.realWidth)
        }
        let usedWidth = childrenWidth - removedWidth;
        let slides = await slidesFetcher(root.offsetWidth - usedWidth, root.offsetHeight, usedWidth < 50)
        for (const slide of slides) {
            if (slide.format == 'video') {
                let vidDiv = document.createElement("video")
                vidDiv.className = "videoSlide"
                vidDiv.setAttribute("controls", "true")
                vidDiv.volume = settings.volume
                if (slide.file) {
                    vidDiv.src = URL.createObjectURL(await slide.file.getFile())
                    vidDiv.setAttribute("data-is-object", "true")
                } else if (slide.url) {
                    vidDiv.src = slide.url
                }
                replaceSlide(root, vidDiv, toRemove.pop(), slide.scaledWidth)
                vidDiv.play()
                let timeout; 
                if (slide.type === 'long') {
                    vidDiv.currentTime = slide.start
                    timeout = setTimeout(() => nextSlide(vidDiv), settings.videoSplittingTime*1000)
                }
                vidDiv.addEventListener("ended", () => {
                    if (timeout) {
                        clearTimeout(timeout)
                    }
                    nextSlide(vidDiv)
                }, false)
                vidDiv.onclick = () => {
                    if (timeout) {
                        clearTimeout(timeout)
                    }
                    nextSlide(vidDiv)
                }
            } else if (slide.format == "image") {
                let imgDiv = document.createElement("img")
                imgDiv.className = "imgSlide"
                if (slide.file) {
                    imgDiv.src = URL.createObjectURL(await slide.file.getFile())
                    imgDiv.setAttribute("data-is-object", "true")
                } else if (slide.url) {
                    imgDiv.src = slide.url
                }
                replaceSlide(root, imgDiv, toRemove.pop(), slide.scaledWidth)
                const timeout = setTimeout(() => nextSlide(imgDiv), jitter(settings.imageInterval*1000))
                imgDiv.onclick = () => {
                    clearTimeout(timeout)
                    nextSlide(imgDiv)
                }
            } else if (slide.type == "iframe") {
                let wrapper = document.createElement("div")
                wrapper.innerHTML = slide.html;
                let iframeDiv = wrapper.firstChild;
                iframeDiv.setAttribute("width", slide.scaledWidth);
                iframeDiv.setAttribute("height", root.offsetHeight);
                iframeDiv.setAttribute("style", null);
                iframeDiv.className = "iframeSlide";
                replaceSlide(root, iframeDiv, toRemove.pop(), slide.scaledWidth)
                const timeout = setTimeout(() => nextSlide(iframeDiv), jitter(settings.imageInterval*1000))
                iframeDiv.onclick = () => {
                    clearTimeout(timeout)
                    nextSlide(imgDiv)
                }
            }
        }
        for(const e of toRemove) {
            if (Array.prototype.indexOf.call(root.children, e) >= 0) {
                const animation = e.animate([
                    { width: e.offsetWidth + "px" },
                    { width: 0 + "px" }
                ], 500)
                animation.onfinish = function() {
                    this.effect.target.parentNode.removeChild(this.effect.target);
                    URL.revokeObjectURL(this.effect.target.src)
                }
            }
        }
        toRemove = []
    }

    async function nextSlide(elemRemoved) {
        if (!root.isConnected) {
            return
        }
        if (elemRemoved) {
            URL.revokeObjectURL(elemRemoved.src)
            toRemove.push(elemRemoved)
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(loadMoreSlides, 100)
    }

    await loadMoreSlides()
}

let slideshowGrid;

async function changeGrid() {
    while (slideshowGrid.children.length > settings.rows) {
        slideshowGrid.removeChild(slideshowGrid.children[slideshowGrid.children.length - 1])
    }
    let rowHeight = 100/settings.rows
    for (let child of document.getElementsByClassName("slideshow-row")) {
        child.style.height = rowHeight + "%"
    }
    for (let i = slideshowGrid.children.length; i < settings.rows; i++) {
        let ssRow = document.createElement("div")
        ssRow.className = "slideshow-row"
        ssRow.style.display = "flex"
        ssRow.style.height = rowHeight + "%"
        slideshowGrid.append(ssRow)
        if (inProgress) {
            setTimeout(() => startSlideShow(slideshowGrid.children[slideshowGrid.children.length - 1]), 100)
        }
    }
}

function showRedditForm() {
    for(let elem of document.getElementsByClassName("noForm")) {
        elem.style.display = 'none'
    }
    document.getElementById("redditForm").style.display = null
}

window.onload = () => {
    document.getElementById("browse").onclick = openDir2
    slideshowGrid = document.getElementById("slideshow-grid")
    document.getElementById("browseReddit").onclick = showRedditForm
    document.getElementById("redditSubmit").onclick = openReddit
    initSettings(changeGrid)
    initReddit()
}
