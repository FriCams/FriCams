<script setup>
import { onBeforeMount, onMounted, reactive, ref } from 'vue';
import Hls from 'hls.js'
import { version } from '../../package.json';

let activeTab = ref("cameras")

let frigateURL = ref(null)
let frigateConfig = {}
let streams = reactive([]) //Streams configured in go2rtc
let cameras = reactive([]) //Cameras configured in Frigate
let streaming = reactive({}) //List of what is streaming on Cameras tab
let loadingRecordings = ref(true)
let recordings = reactive({
  start_day: null,
  end_day: null
})
let showingRecordings = ref(false)

let settingsError = ref(null)

let selectedRecordingStartTime = ref(null)
let selectedRecordingEndTime = ref(null)
let selectedSource = ref(null)
let recordingURL = ref(null)


let streamSources = [
  {
    label: "WebRTC stream / browsers: all / codecs: H264, PCMU, PCMA, OPUS / +H265 in Safari",
    value: 1,
    url: "/live/webrtc/stream.html?mode=webrtc&src="
  },
  {
    label: "MSE stream / browsers: Chrome, Firefox, Safari Mac/iPad / codecs: H264, H265*, AAC / +OPUS in Chrome and Firefox",
    value: 2,
    url: "/live/webrtc/stream.html?mode=mse&src="
  },
  {
    label: "MP4 stream with AAC audio / browsers: Chrome, Firefox / codecs: H264, H265*, AAC",
    value: 3,
    url: "/live/webrtc/api/stream.mp4?src="
  },
  {
    label: "MP4 stream with any audio / browsers: Chrome / codecs: H264, H265*, AAC, OPUS, MP3, PCMU, PCMA",
    value: 4,
    url: "/live/webrtc/api/stream.mp4?video=h264,h265&audio=aac,opus,mp3,pcma,pcmu&src="
  },
  {
    label: "HLS/TS / browsers: Safari all, Chrome Android / codecs: H264",
    value: 5,
    url: "/live/webrtc/api/stream.m3u8?src="
  },
  {
    label: "HLS/fMP4 / browsers: Safari all, Chrome Android / codecs: H264, H265*, AAC",
    value: 6,
    url: "/live/webrtc/api/stream.m3u8?mp4&src="
  },
  {
    label: "WebRTC with two-way audio for supported cameras / browsers: all / codecs: H264, PCMU, PCMA, OPUS",
    value: 7,
    url: "/live/webrtc/webrtc.html?src="
  }

]

onBeforeMount(async () => {

  /* Setting local storage / values */
  let localFrigateUrl = localStorage.getItem('frigateURL')
  let localStreams = JSON.parse(localStorage.getItem('streams'))
  let localSource = localStorage.getItem('source')
  if (localSource != null) selectedSource.value = localSource

  if (localStreams != null) {
    //console.log(" localStreams " + localStreams)
    for (let index = 0; index < localStreams.length; index++) {
      const element = localStreams[index];
      streams.push(element)
    }
  }

  if (localFrigateUrl != null) {
    frigateURL.value = localFrigateUrl
    await getConfig().catch(error => {
      settingsError.value = error
    })
    getRecordings()
  }


  if (streams.length > 0) {
    getStreamingCams()
  }

})

onMounted(() => {
  const tabs = [].slice.call(document.querySelectorAll('button[data-bs-toggle="tab"]'))
  tabs.forEach((tabEl) => {
    tabEl.addEventListener('shown.bs.tab', event => {
      activeTab.value = event.target.getAttribute('id')
      if (activeTab.value != "cameras") {
        stopStreams()
      }
    })

    tabEl.addEventListener('click', event => {
      if (event.target.getAttribute('id') == "cameras") {
        refreshStreams(0)
      }
    })
  })

  addEventListenerToStreams()

})

//List of streaming cams on Cameras page
function getStreamingCams() {
  for (let index = 0; index < streams.length; index++) {
    const element = streams[index];
    //console.log(" element "+JSON.stringify(element))
    if (element.show == true) {
      streaming[element.cam] = false
    }

  }
}

function addEventListenerToStreams(){
  const videos = document.querySelectorAll('.secVideo');
  videos.forEach(video => {
    const videoId = video.id;
    video.addEventListener('play', () => {
      console.log("  --> " + videoId + " is playing");
      streaming[videoId] = true
    });

    video.addEventListener('pause', () => {
      console.log("  --> " + videoId + " is paused");
      streaming[videoId] = false
    });

    video.addEventListener('ended', () => {
      console.log("  --> " + videoId + " has ended");
      streaming[videoId] = false
    });

    video.addEventListener('waiting', () => {
      console.log("  --> " + videoId + " is on hold (buffering)");
      streaming[videoId] = false
    });

    video.addEventListener('playing', () => {
      //console.log("  --> "+videoId+" is playing after buffering");
      streaming[videoId] = true
    });
  });
}

function removeEventListenerToStreams(){
  const videos = document.querySelectorAll('.secVideo');
  videos.forEach(video => {
    const videoId = video.id;
    video.removeEventListener('play', () => {
      console.log("  --> " + videoId + " is playing");
      streaming[videoId] = true
    });

    video.removeEventListener('pause', () => {
      console.log("  --> " + videoId + " is paused");
      streaming[videoId] = false
    });

    video.removeEventListener('ended', () => {
      console.log("  --> " + videoId + " has ended");
      streaming[videoId] = false
    });

    video.removeEventListener('waiting', () => {
      console.log("  --> " + videoId + " is on hold (buffering)");
      streaming[videoId] = false
    });

    video.removeEventListener('playing', () => {
      //console.log("  --> "+videoId+" is playing after buffering");
      streaming[videoId] = true
    });
  });
}

/* SETTINGS */
function reloadPage() {
  location.reload()
}

async function getConfig() {
  return new Promise(async (resolve, reject) => {
    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: frigateURL.value + '/api/config',
      headers: {
        'Accept': 'application/json',
      }
    };
    await axios.request(config)
      .then(async (response) => {
        //console.log("response " + JSON.stringify(response.data))
        frigateConfig = response.data
        //console.log("frigateConfig " + JSON.stringify(frigateConfig))
        let go2rtcConfigured = false

        for (let conf in frigateConfig) {
          if (conf == "go2rtc" && frigateConfig[conf].hasOwnProperty("streams")) {
            go2rtcConfigured = true
            for (let cam in frigateConfig[conf].streams) {
              //console.log(" cam " + cam)
              if (streams.length > 0) {
                let existingCam = streams.find(x => x.cam == cam)
                if (!existingCam) {
                  let temp = {}
                  temp.cam = cam
                  temp.show = false
                  streams.push(temp)
                }
              } else {
                let temp = {}
                temp.cam = cam
                temp.show = false
                streams.push(temp)
              }

            }
            localStorage.setItem('streams', JSON.stringify(streams));
            getStreamingCams()
            //console.log("-> Streams " + JSON.stringify(streams))
          }

          if (conf == "cameras") {
            for (let camName in frigateConfig[conf]) {
              cameras.push(camName)
            }
            //console.log("-> Streams " + JSON.stringify(streams))
          }
        }
        if (!go2rtcConfigured) settingsError.value = "go2rtc streams are not configured"
        resolve()
      })
      .catch((error) => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          //console.log("-> Error response Frigate Config " + error.response.data)
          reject("Error response Frigate Config " + error.response.data)

        } else if (error.request) {
          // The request was made but no response was received
          //console.log('No response received from the server')
          reject("No response received from the server")
        } else {
          // Something happened in setting up the request that triggered an Error
          //console.log("-> Error message Frigate Config " + error.message)
          reject("Error message Frigate Config " + error.message)
        }

      })
  })
}

async function getRecordings() {
  return new Promise(async (resolve, reject) => {
    loadingRecordings.value = true
    for (let i = 0; i < cameras.length; i++) {
      const element = cameras[i]
      //console.log(" element " + JSON.stringify(element))
      let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: frigateURL.value + '/api/' + element + '/recordings/summary',
        headers: {
          'Accept': 'application/json',
        }
      };
      await axios.request(config)
        .then(async (response) => {
          let resp = response.data
          //console.log("response " + JSON.stringify(resp))
          //console.log("recordings.start_day " + typeof recordings.start_day)
          if (resp.length > 0) {
            if (recordings.start_day == null && recordings.end_day == null) {
              recordings.start_day = resp[resp.length - 1].day
              recordings.end_day = resp[0].day
            } else {
              if (dayjs(resp[resp.length - 1].day).isBefore(dayjs(recordings.start_day))) {
                recordings.start_day = resp[resp.length - 1].day
              }
              if (dayjs(resp[0].day).isAfter(dayjs(recordings.end_day))) {
                recordings.end_day = resp[0].day
              }
            }
          }

          //console.log(" -> Recordings " + JSON.stringify(recordings))
        })
        .catch((error) => {
          if (error.response) {
            reject("Error response recordings " + error.response.data)

          } else if (error.request) {
            reject("No response received from the server for recordings")
          } else {
            reject("Error message recordings " + error.message)
          }

        })
    }
    loadingRecordings.value = false
    console.log(" -> Recordings " + JSON.stringify(recordings))
    resolve()
  })
}

async function saveFrigateURL() {
  settingsError.value = null
  console.log("Frigate URL " + frigateURL.value)
  localStorage.setItem('frigateURL', frigateURL.value);
  localStorage.setItem('source', streamSources[0].url)

  await getConfig().catch(error => {
    settingsError.value = error
  })
  getRecordings()
}

function saveStreams() {
  //console.log("-> Streams " + JSON.stringify(streams))
  localStorage.setItem('streams', JSON.stringify(streams));
  getStreamingCams()
}

function saveSource() {
  localStorage.setItem('source', selectedSource.value)
}

/* RECORDINGS */
function inputStartTime(param) {
  //console.log(" param "+param)
  selectedRecordingStartTime.value = dayjs(param).unix()
  //console.log(" -> Selected Start Time " + selectedRecordingStartTime.value)
}

function inputEndTime(param) {
  //console.log(" param "+param)
  selectedRecordingEndTime.value = dayjs(param).unix()
  //console.log(" -> Selected End Time " + selectedRecordingEndTime.value)
}

function showRecordings() {
  if (selectedRecordingEndTime.value < selectedRecordingStartTime.value) {
    alert("Selected end date and time must be after start date and time.")
  } else {
    showingRecordings.value = true
    for (let index = 0; index < cameras.length; index++) {
      const element = cameras[index];
      let video = document.getElementById("recordingVideo_" + element);
      let videoSRC = frigateURL.value + "/vod/" + element + "/start/" + selectedRecordingStartTime.value + "/end/" + selectedRecordingEndTime.value + "/index.m3u8"
      if (Hls.isSupported()) {
        var hls = new Hls({
        })
        hls.loadSource(videoSRC);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSRC;
      } else {
        alert('HLS is not supported in your browser.');
      }
    }
  }
}

/* CAMERAS */
function refreshStreams(param) {
  if (param == 0) {
    console.log(" -> Refreshing all streams")
    let filteredStreams = streams.filter(element => element.show == true)
    for (let index = 0; index < filteredStreams.length; index++) {
      const element = filteredStreams[index];
      streaming[element.cam] = false
      let video = document.getElementById(element.cam);

      // Reload and play the video when it's loaded
      video.addEventListener("loadeddata", function () {
        video.play();
      });

      video.load();
    }
    //location.reload()
  } else {
    console.log(" -> Refreshing " + param)
    streaming[param] = false
    let video = document.getElementById(param);

    // Reload and play the video when it's loaded
    video.addEventListener("loadeddata", function () {
      video.play();
    });

    video.load();

    //document.getElementById(param).load()
    //document.getElementById(param).play()
  }
}

function videoUrl(param) {
  return frigateURL.value + "" + selectedSource.value + "" + param
}

function stopStreams() {
  const filteredStreams = streams.filter(x => x.show == true)
  for (let index = 0; index < filteredStreams.length; index++) {
    const element = filteredStreams[index];
    //console.log(" element " + JSON.stringify(element))
    let video = document.getElementById(element.cam);
    video.pause()
  }

}

</script>

<template>
  <div class="container-fluid">
  <nav class="navbar fixed-top navbar-expand-lg">
    <div class="container-fluid justify-content-center">
      <ul class="nav nav-underline" id="myTab" role="tablist">
        <li class="nav-item" role="presentation">
          <button id="cameras" :class="[activeTab == 'cameras' ? 'active' : '', 'nav-link fs-4']" data-bs-toggle="tab"
            data-bs-target="#cameras-nav" type="button" role="tab" aria-controls="home-tab-pane"
            aria-selected="true">Cameras (<i class="uil uil-sync fs-6"></i>)</button>
        </li>

        <li class="nav-item" role="presentation">
          <button id="recordings" :class="[activeTab == 'recordings' ? 'active' : '', 'nav-link fs-5']" data-bs-toggle="tab"
            data-bs-target="#recordings-nav" type="button" role="tab" aria-controls="profile-tab-pane"
            aria-selected="false">Recordings</button>
        </li>

        <li class="nav-item" role="presentation">
          <button id="settings" :class="[activeTab == 'settings' ? 'active' : '', 'nav-link fs-5']" data-bs-toggle="tab"
            data-bs-target="#settings-nav" type="button" role="tab" aria-controls="contact-tab-pane"
            aria-selected="false">Settings</button>
        </li>

      </ul>
    </div>
  </nav>
  
  
  
    <div class="tab-content" id="myTabContent">

      <!--************************** CAMERAS **************************-->
      <div :class="[activeTab == 'cameras' ? 'show active' : '', 'tab-pane fade']" id="cameras-nav" role="tabpanel"
        aria-labelledby="cameras-tab" tabindex="0">
        <div class="row">
          <div v-if="frigateURL == null || (streams != null && streams.length == 0)"
            class="col-12 mt-5 text-center align-middle">
            Configure your Frigate URL and cameras in Settings
          </div>
          <div v-else>
            <div class="row">
              <div v-for="stream in streams.filter(element => element.show == true)" class="col-12 col-sm-6">
                <div class="video-container">
                  <video :id="stream.cam"
                    :class="[streaming[stream.cam] === false ? 'redBorder' : 'greenBorder', 'secVideo']" width="100%"
                    height="100%" controls="" autoplay muted playsinline name="media">
                    <source :src="videoUrl(stream.cam)">
                  </video>
                  <button class="overlay-button btn btn-link" v-on:click="refreshStreams(stream.cam)"><i
                      class="uil uil-sync fs-6"></i></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!--************************** RECORDINGS **************************-->
      <div :class="[activeTab == 'recordings' ? 'show active' : '', 'tab-pane fade']" id="recordings-nav" role="tabpanel"
        aria-labelledby="recordings-tab" tabindex="0">
        <div v-if="loadingRecordings" class="d-flex justify-content-center mt-4">
          <div class="spinner-border" role="status">
            <span class="visually-hidden"></span>
          </div>
        </div>
        <div v-else>
          <div v-if="recordings.start_day != null && recordings.end_day != null" class="row mt-3 container-fluid">
            
            <div class="form-floating col-12 col-lg-6 mb-2">
              <input class="form-control" type="datetime-local" :min="recordings.start_day + 'T00:00:00'"
                :max="recordings.end_day + 'T23:59:59'" v-on:input="inputStartTime($event.target.value)">
              <label for="floatingSelect">Select Start Date&Time</label>
            </div>

            <div class="form-floating col-12 col-lg-6 mb-2">
              <input class="form-control" type="datetime-local" :min="recordings.start_day + 'T00:00:00'"
                :max="recordings.end_day + 'T23:59:59'" v-on:input="inputEndTime($event.target.value)">
              <label for="floatingSelect">Select End Date&Time</label>
            </div>
            
            <button v-on:click="showRecordings" type="button" class="btn btn-success btn-block">Show</button>



            <!--<video id="video" width="100%" height="100%" controls="" autoplay muted playsinline name="media"></video>-->
          </div>
          <div class="row" v-show="showingRecordings">
            <div class="mt-2 col-12 col-sm-6" v-for="item in cameras">
              <video :id="'recordingVideo_' + item" width="100%" height="100%" controls="" muted playsinline name="media">
              </video>
            </div>
          </div>
        </div>
      </div>

      <!--************************** SETTINGS **************************-->
      <div :class="[activeTab == 'settings' ? 'show active' : '', 'tab-pane fade container-fluid']" id="settings-nav"
        role="tabpanel" aria-labelledby="settings-tab" tabindex="0">
        <div class="row justify-content-md-center">
          <div class="col-12 col-lg-6">
            <div class="row align-items-center">
              <div class="col-6">
                FriCams v{{ version }}
              </div>
              <div class="col-6 text-end">
                <button type="button" class="btn btn-light mt-2" v-on:click="reloadPage">Reload App</button>
              </div>
            </div>
            
            <!-- Frigate URL -->
            <div class="row mt-3 align-items-center">
              <hr>
              <div class="col-4">Frigate URL
              </div>
              <div class="col-8">
                <div class="input-group">
                  <input type="text" class="form-control" v-model="frigateURL">
                </div>
              </div>
              <div class="row justify-content-center">
              </div>
              <button type="button" class="btn btn-success mt-2" v-on:click="saveFrigateURL">Save</button>
            </div>
            <div v-if="settingsError != null" class="text-danger mt-1"><i class="uil uil-exclamation-triangle"></i> {{
              settingsError }}</div>

            <!-- List of Streams -->
            <div v-if="streams != null && streams.length > 0">
              <hr>
              <h2>Streams</h2>
              <div class="row mt-2" v-for="stream in streams">

                <div class="col-4">{{ stream.cam }}</div>
                <div class="col-8">

                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" :id="stream.cam" :checked="stream.show"
                      v-on:change="stream.show = !stream.show">
                  </div>
                </div>
              </div>
              <div class="row">
                <button type="button" class="btn btn-success mt-2" v-on:click="saveStreams">Save</button>
                <div v-if="settingsError != null" class="text-danger mt-1"><i class="uil uil-exclamation-triangle"></i> {{
                  settingsError }}</div>
              </div>
            </div>

            <!-- Stream Source -->
            <div v-if="streams != null && streams.length > 0">
              <hr>
              <h2>Stream Source</h2>
              <div class="row mt-2">
                <div v-for="item in streamSources" :key="item.value" class="form-check"
                  v-on:input="selectedSource = $event.target.value">
                  <input class="form-check-input" type="radio" name="streamSourceRadios" :id="item.value"
                    :value="item.url" :checked="selectedSource == item.url">
                  {{ item.label }}
                </div>
              </div>
              <div class="row">
                <button type="button" class="btn btn-success mt-2" v-on:click="saveSource">Save</button>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>

  </div>
</template>
