var gh = (function() {
  'use strict';

  var signin_button;
  var revoke_button;
  var user_info_div;

  var tokenFetcher = (function() {
    // Replace clientId and clientSecret with values obtained by you for your
    // application https://github.com/settings/applications.
    var clientId = '11442b0924c8d6a98fb7';
    // Note that in a real-production app, you may not want to store
    // clientSecret in your App code.
    var clientSecret = 'a1499b1a5780c8a21ed560b839741e803c4cc936';
    var redirectUri = chrome.identity.getRedirectURL('provider_cb');
    var redirectRe = new RegExp(redirectUri + '[#\?](.*)');

    var access_token = null;

    return {
      getToken: function(interactive, callback) {
        // In case we already have an access_token cached, simply return it.
        if (access_token) {
          callback(null, access_token);
          return;
        }
		console.log('in token')
        var options = {
          'interactive': interactive,
          'url': 'http://10.0.0.9:8081/chromeext/login' 
                 
        }
        chrome.identity.launchWebAuthFlow(options, function(redirectUri) {
          console.log('launchWebAuthFlow completed', chrome.runtime.lastError,
              redirectUri);

          if (chrome.runtime.lastError) {
            callback(new Error(chrome.runtime.lastError));
			console.log('Error')
            return;
          }

          // Upon success the response is appended to redirectUri, e.g.
          // https://{app_id}.chromiumapp.org/provider_cb#access_token={value}
          //     &refresh_token={value}
          // or:
          // https://{app_id}.chromiumapp.org/provider_cb#code={value}
          var matches = redirectUri.match(redirectRe);
          if (matches && matches.length > 1)
            handleProviderResponse(parseRedirectFragment(matches[1]));
          else
            callback(new Error('Invalid redirect URI'));
        });

        function parseRedirectFragment(fragment) {
          var pairs = fragment.split(/&/);
          var values = {};

          pairs.forEach(function(pair) {
            var nameval = pair.split(/=/);
            values[nameval[0]] = nameval[1];
          });

          return values;
        }

        function handleProviderResponse(values) {
          console.log('providerResponse', values);
          if (values.hasOwnProperty('access_token'))
            setAccessToken(values.access_token);
          // If response does not have an access_token, it might have the code,
          // which can be used in exchange for token.
          else if (values.hasOwnProperty('code'))
            exchangeCodeForToken(values.code);
          else 
            callback(new Error('Neither access_token nor code avialable.'));
        }

        function exchangeCodeForToken(code) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET',
                   'https://10.0.0.9:8081/chromeext/login'
                  );
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.onload = function () {
            // When exchanging code for token, the response comes as json, which
            // can be easily parsed to an object.
            if (this.status === 200) {
              var response = JSON.parse(this.responseText);
              console.log(response);
              if (response.hasOwnProperty('access_token')) {
                setAccessToken(response.access_token);
              } else {
                callback(new Error('Cannot obtain access_token from code.'));
              }
            } else {
              console.log('code exchange status:', this.status);
              callback(new Error('Code exchange failed'));
            }
          };
          xhr.send();
        }

        function setAccessToken(token) {
          access_token = token; 
          console.log('Setting access_token: ', access_token);
          callback(null, access_token);
        }
      },

      removeCachedToken: function(token_to_remove) {
        if (access_token == token_to_remove)
          access_token = null;
      }
    }
  })();

  function xhrWithAuth(method, url, interactive, callback) {
    var retry = true;
    var access_token;

    console.log('xhrWithAuth', method, url, interactive);
    getToken();

    function getToken() {
      tokenFetcher.getToken(interactive, function(error, token) {
        console.log('token fetch', error, token);
        if (error) {
          callback(error);
          return;
        }

        access_token = token;
        requestStart();
      });
    }

    function requestStart() {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
      xhr.onload = requestComplete;
      xhr.send();
    }

    function requestComplete() {
      console.log('requestComplete', this.status, this.response);
      if ( ( this.status < 200 || this.status >=300 ) && retry) {
        retry = false;
        tokenFetcher.removeCachedToken(access_token);
        access_token = null;
        getToken();
      } else {
        callback(null, this.status, this.response);
      }
    }
  }

  function getUserInfo(interactive) {
    xhrWithAuth('GET',
                'https://10.0.0.9:8081/chromeext/login',
                interactive,
                onUserInfoFetched);
  }

  // Functions updating the User Interface:

  function showButton(button) {
    button.style.display = 'inline';
    button.disabled = false;
  }

  function hideButton(button) {
    button.style.display = 'none';
  }

  function disableButton(button) {
    button.disabled = true;
  }

  function onUserInfoFetched(error, status, response) {
    if (!error && status == 200) {
      console.log("Got the following user info: " + response);
      var user_info = JSON.parse(response);
      populateUserInfo(user_info);
      //hideButton(signin_button);
      showButton(revoke_button);
      fetchUserRepos(user_info["repos_url"]);
    } else {
      console.log('infoFetch failed', error, status);
      showButton(signin_button);
    }
  }

  function populateUserInfo(user_info) {
    var elem = user_info_div;
    var nameElem = document.createElement('div');
    nameElem.innerHTML = "<b>Hello " + user_info.name + "</b><br>"
    	+ "Your github page is: " + user_info.html_url;
    elem.appendChild(nameElem);
  }



  function fetchUserRepos(repoUrl) {
    xhrWithAuth('GET', repoUrl, false, onUserReposFetched);
  }

  function onUserReposFetched(error, status, response) {
    var elem = document.querySelector('#user_repos');
    elem.value='';
    if (!error && status == 200) {
      console.log("Got the following user repos:", response);
      var user_repos = JSON.parse(response);
      user_repos.forEach(function(repo) {
        if (repo.private) {
          elem.value += "[private repo]";
        } else {
          elem.value += repo.name;
        }
        elem.value += '\n';
      });
    } else {
      console.log('infoFetch failed', error, status);
    }
    
  }
  
  
  function save_token(acces_token){
	  chrome.storage.sync.set({'token': acces_token}, function() {
			  
			  console.log('Settings saved');
			});
		
	}

  // Handlers for the buttons's onclick events.
  
   function listent_to_channel() {
		var channel = '210'
		var ws = new WebSocket('ws://localhost:8000/ws/'+ channel +'?subscribe-broadcast');
			ws.onopen = function() {
				console.log("websocket connected");
			};
			ws.onmessage = function(e) {
				if(e.data != "--heartbeat--"){
						console.log("Received: " + e.data);
						var obj = JSON.parse(e.data)
						console.log('subject:'+obj.subject)
						console.log('accept:'+obj.url_accept)
						console.log('reject:'+obj.url_reject)
						var opt = {
						  type: "basic",
						  title: obj.subject,
						  message: "accept:" + obj.url_accept+ " reject:"+obj.url_reject,
						  buttons: [{
							title: "Yes",
							iconUrl: "icon_016.png"
								}, {
							title: "No",
							iconUrl: "icon_016.png"
							}],
						  iconUrl: "icon_016.png"
						}
						chrome.notifications.create("20", opt);
				}
				
				
			};
			ws.onerror = function(e) {
				console.error(e);
			};
			ws.onclose = function(e) {
				console.log("connection closed");
			}
			function send_message(msg) {
				ws.send(msg);
			}
   }

  function interactiveSignIn() {
	console.log('in token')
        var options = {
          'interactive': true,
          'url': 'http://10.0.0.2:80/chromeext/login?redirect_uri='+ chrome.identity.getRedirectURL()
                 
        }
		
        chrome.identity.launchWebAuthFlow(options, function(redirectUri) {
          console.log('launchWebAuthFlow completed', chrome.runtime.lastError,
              redirectUri);
			  var channel = redirectUri.split('/').pop()
			  console.log(channel)
			  var ws = new WebSocket('ws://localhost:8000/ws/'+ channel +'?subscribe-broadcast');
			  console.log(channel)
			  var heartbeat_msg = '--heartbeat--', heartbeat_interval = null, missed_heartbeats = 0;

			ws.onopen = function() {
							
				 if (heartbeat_interval === null) {
					missed_heartbeats = 0;
					heartbeat_interval = setInterval(function() {
					try {
						missed_heartbeats++;
						if (missed_heartbeats >= 3)
							throw new Error("Too many missed heartbeats.");
						ws.send(heartbeat_msg);
						} catch(e) {
								clearInterval(heartbeat_interval);
								heartbeat_interval = null;
								console.warn("Closing connection. Reason: " + e.message);
								ws.close();
							}
					}, 5000);
				}
						console.log("websocket connected");
			};
			ws.onmessage = function(e) {
				var myNotificationID = null;
				if (e.data === heartbeat_msg) {
					// reset the counter for missed heartbeats
					missed_heartbeats = 0;
					return;
				}
				else{
					var obj = JSON.parse(e.data)
					console.log('subject:'+obj.subject)
					console.log('accept:'+obj.url_accept)
					console.log('reject:'+obj.url_reject)
					var opt = {
					  type: "basic",
					  title: obj.subject,
					  message: "accept:" + obj.url_accept+ " reject:"+obj.url_reject,
					  eventTime: Date.now(),
					  buttons: [{
						title: "Yes",
						iconUrl: "icon_016.png"
							}, {
						title: "No",
						iconUrl: "icon_016.png"
						}],
					  iconUrl: "icon_016.png"
					}
					chrome.notifications.create("20", opt);
					chrome.notifications.onButtonClicked.addListener(function(notifId, btnIdx) {
						
							if (btnIdx === 0) {
								window.open('http://10.0.0.2:80'+obj.url_accept);
							} else if (btnIdx === 1) {
								window.open('http://10.0.0.2:80'+obj.url_reject)
							}
						
					});
					
					chrome.notifications.onClosed.addListener(function() {
						window.open('http://10.0.0.2:80'+obj.url_reject)
					});

				}
			};
				
				
			
			ws.onerror = function(e) {
				console.error(e);
			};
			ws.onclose = function(e) {
				console.log("connection closed");
			}
			function send_message(msg) {
				ws.send(msg);
			}

        if (chrome.runtime.lastError) {
            //callback(new Error(chrome.runtime.lastError));
			console.log('Error')
            return;
          }
		});
		
		
		
		
		
  }

  function revokeToken() {
    // We are opening the web page that allows user to revoke their token.
    window.open('https://github.com/settings/applications');
    // And then clear the user interface, showing the Sign in button only.
    // If the user revokes the app authorization, they will be prompted to log
    // in again. If the user dismissed the page they were presented with,
    // Sign in button will simply sign them in.
    user_info_div.textContent = '';
    //hideButton(revoke_button);
    showButton(signin_button);
  }

  return {
    onload: function () {
		
		
	  signin_button = document.querySelector('#signin');	
	  showButton(signin);
     
      //signin_button.onclick = interactiveSignIn;
	  	signin_button.onclick = listent_to_channel	
      //revoke_button = document.querySelector('#revoke');
      //revoke_button.onclick = revokeToken;

      //user_info_div = document.querySelector('#user_info');

     // console.log(signin_button, revoke_button, user_info_div);

      
      //getUserInfo(false);
    }
  };
})();


window.onload = gh.onload;
