/*
   Copyright (c) 2007-10, iUI Project Members
   See LICENSE.txt for licensing terms
   Version @VERSION@
 */

/* This version of iUI has a partial implementation of the "busy" flag for Issue #191
   It will not work with webapps that call iui.showPage() or iui.showPageByHref() directly
   This issue will be resolved in a later version */

(function() {

var slideSpeed = 20;
var slideInterval = 0;
var ajaxTimeoutVal = 30000;

var currentPage = null;
var currentDialog = null;
var currentWidth = 0;
var currentHeight = 0;
var currentHash = location.hash;
var hashPrefix = "#_";
var pageHistory = [];
var newPageCount = 0;
var checkTimer;
var hasOrientationEvent = false;
var portraitVal = "portrait";
var landscapeVal = "landscape";

// *************************************************************************************************

window.iui =
{
	busy: false,	// A touch/click that will result in a slide is in progress
	animOn: true,	// Slide animation with CSS transition is now enabled by default where supported
	ajaxErrHandler : null,

	httpHeaders: {
	    "X-Requested-With" : "XMLHttpRequest"
	},

	// showPage() should probably be an internal function
	// external callers should call showPageById()
	// it doesn't check busy flag because it is called by other functions that have alread set it
	//
	showPage: function(page, backwards)
	{
		if (page)
		{
//			if (window.iui_ext)	window.iui_ext.injectEventMethods(page);	// TG -- why was this comment left here??
			if (page == currentPage)
			{
				console.log("page = currentPage = " + page.id);
				iui.busy = false;	//  Don't do anything, just clear the busy flag and exit
				return;
			}
			
			if (currentDialog)
			{
				currentDialog.removeAttribute("selected");
				sendEvent("blur", currentDialog);					// EVENT: BLUR
				currentDialog = null;
			}

			if (hasClass(page, "dialog"))
			{
				// There's no LOAD/UNLOAD events for dialogs -- is that the way it should be??
				// Should the view the dialog is going over get a BLUR??
				sendEvent("focus", page);							// EVENT: FOCUS
				showDialog(page);
			}
			else
			{
				sendEvent("load", page);    						// EVENT: LOAD
													// 127(stylesheet), 128(script), 129(onload)
													// 130(onFocus), 133(loadActionButton)
				var fromPage = currentPage;
				sendEvent("blur", currentPage);						// EVENT: BLUR
				currentPage = page;
				sendEvent("focus", page);							// EVENT: FOCUS

				if (fromPage)
				{
				    if (backwards) sendEvent("unload", fromPage);	// EVENT: UNLOAD
					setTimeout(slidePages, 0, fromPage, page, backwards);
				}
				else
				{
					updatePage(page, fromPage);
				}
					
			}
		}
	},

	showPageById: function(pageId)
	{
		var page = $(pageId);
		if (page)
		{
			if (!iui.busy)
			{
				iui.busy = true;
				var index = pageHistory.indexOf(pageId);
				var backwards = index != -1;
				if (backwards)
				{
					// we're going back, remove history from index on
					// remember - pageId will be added again in updatePage
					pageHistory.splice(index);
				}
	
				iui.showPage(page, backwards);
			}
		}
	},
	
	goBack: function()
	{
		if (!iui.busy)
		{
			iui.busy = true;
			pageHistory.pop();	// pop current page
			var pageID = pageHistory.pop();  // pop/get parent
			var page = $(pageID);
			iui.showPage(page, true);
		}
	},


	// Load a new page at the same level in the navStack
	// Currently it will do a slide-in animation but replaces
	// the current page in the navStack
	// it should probably use a different animation (slide-up/slide-down)
	replacePage: function(pageId)
	{
		// Should probably take either an ID or an Element
		var page = $(pageId);
		if (page)
		{
			if (!iui.busy)
			{
				iui.busy = true;
				var index = pageHistory.indexOf(pageId);
				var backwards = index != -1;
				if (backwards)	// we're going back, shouldn't happen on replacePage()
					console.log("error: can't replace page with ancestor");
					
				pageHistory.pop();
	
				iui.showPage(page, false);
			}
		}
	},

	// External version, for this release you'll have to use showPageByHrefExt()
	// to do an ajax load programmatically from your webapp
	// This should be renamed to showPageByHref() once the old method and  all 
	// it's calls are renamed.
	showPageByHrefExt: function(href, args, method, replace, cb)
	{
		if (!iui.busy)
		{
			iui.busy = true;
			iui.showPageByHref(href, args, method, replace, cb);	
		}
	},

	// This one should only be used by iUIinternally.  It should be renamed and possibly moved into
	// the closure
	showPageByHref: function(href, args, method, replace, cb)
	{
	  // I don't think we need onerror, because readstate will still go to 4 in that case
		function spbhCB(xhr) 
		{
			console.log("xhr.readyState = " + xhr.readyState);
			if (xhr.readyState == 4)
			{
				if (xhr.status == 200 && !xhr.aborted)
				{
				  // Add 'if (xhr.responseText)' to make sure we have something???
				  // Can't use createDocumentFragment() here because firstChild is null and childNodes is empty
				  var frag = document.createElement("div");
				  frag.innerHTML = xhr.responseText;
				  // EVENT beforeInsert->body
				  sendEvent("beforeinsert", document.body, {fragment:frag})
				  if (replace)
				  {
					  replaceElementWithFrag(replace, frag);
					  iui.busy = false;
				  }
				  else
				  {
					  iui.insertPages(frag);
				  }
				}
				else
				{
					iui.busy = false;
					if (iui.ajaxErrHandler)
					{
						iui.ajaxErrHandler("Error contacting server, please try again later");
					}
				}
				if (cb)
				{
					setTimeout(cb, 1000, true);
				}
			}
		  
		};
	  iui.ajax(href, args, method, spbhCB);
	},
	
	// Callback function gets a single argument, the XHR
	ajax: function(url, args, method, cb)
	{
        var xhr = new XMLHttpRequest();
        method = method ? method.toUpperCase() : "GET";
        if (args && method == "GET")
        {
          url =  url + "?" + iui.param(args);
        }
        xhr.open(method, url, true);
        if (cb)
        {
			xhr.onreadystatechange = function() { cb(xhr); };
        }
        var data = null;
        if (args && method != "GET")
        {
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
            data = iui.param(args);
        }
        for (var header in iui.httpHeaders)
        {
            xhr.setRequestHeader(header, iui.httpHeaders[header]);
        }
        xhr.send(data);
        xhr.requestTimer = setTimeout( ajaxTimeout, ajaxTimeoutVal );
		return xhr;
        function ajaxTimeout()
        {
			try{
		 		xhr.abort();
		   		xhr.aborted = true;
			}
		   	catch(err){
				console.log(err);
		 	}
		}
	},
	
	// Thanks, jQuery
	//	stripped-down, simplified, object-only version
	param: function( o )
	{
	  var s = [ ];
	
	  // Serialize the key/values
	  for ( var key in o )
		s[ s.length ] = encodeURIComponent(key) + '=' + encodeURIComponent(o[key]);
  
	  // Return the resulting serialization
	  return s.join("&").replace(/%20/g, "+");
	},

	insertPages: function(frag)
	{
		var nodes = frag.childNodes;
		var targetPage;
		for (var i = 0; i < nodes.length; ++i)
		{
			var child = nodes[i];
			if (child.nodeType == 1)
			{
				if (!child.id)
					child.id = "__" + (++newPageCount) + "__";

				var clone = $(child.id);
				var docNode;
				if (clone) {
					clone.parentNode.replaceChild(child, clone);
				    docNode = $(child.id);
			    }
				else
					docNode = document.body.appendChild(child);
					
				sendEvent("afterinsert", document.body, {insertedNode:docNode});   

				// First child becomes selected page/view by default unless
				// selected="true" is set
				// BUG: selected="true" results in a visually incorrect transition
				if (child.getAttribute("selected") == "true" || !targetPage)
					targetPage = child;
				
				--i;
			}
		}
		sendEvent("afterinsertend", document.body, {fragment:frag})

		if (targetPage)
			iui.showPage(targetPage);

	},

	getSelectedPage: function()
	{
		for (var child = document.body.firstChild; child; child = child.nextSibling)
		{
			if (child.nodeType == 1 && child.getAttribute("selected") == "true")
				return child;
		}	 
	},
	isNativeUrl: function(href)
	{
		for(var i = 0; i < iui.nativeUrlPatterns.length; i++)
		{
			if(href.match(iui.nativeUrlPatterns[i])) return true;
		}
		return false;
	},
	nativeUrlPatterns: [
		new RegExp("^http:\/\/maps.google.com\/maps\?"),
		new RegExp("^mailto:"),
		new RegExp("^tel:"),
		new RegExp("^http:\/\/www.youtube.com\/watch\\?v="),
		new RegExp("^http:\/\/www.youtube.com\/v\/"),
		new RegExp("^javascript:"),

	],
	hasClass: function(self, name)
	{
		var re = new RegExp("(^|\\s)"+name+"($|\\s)");
		return re.exec(self.getAttribute("class")) != null;
	},
		
	addClass: function(self, name)
	{
	  if (!iui.hasClass(self,name)) self.className += " "+name;
	},
		
	removeClass: function(self, name)
	{
	  if (iui.hasClass(self,name)) {
		  var reg = new RegExp('(\\s|^)'+name+'(\\s|$)');
		self.className=self.className.replace(reg,' ');
	  }
	}
};

// *************************************************************************************************

addEventListener("load", function(event)
{
	var page = iui.getSelectedPage();
	var locPage = getPageFromLoc();
		
	if (page)
			iui.showPage(page);
	
	if (locPage && (locPage != page))
		iui.showPage(locPage);
	
	setTimeout(preloadImages, 0);
	if (typeof window.onorientationchange == "object")
	{
		window.onorientationchange=orientChangeHandler;
		hasOrientationEvent = true;
		setTimeout(orientChangeHandler, 0);
	}
	setTimeout(checkOrientAndLocation, 0);
	checkTimer = setInterval(checkOrientAndLocation, 300);
}, false);

addEventListener("unload", function(event)
{
	return;
}, false);
	
addEventListener("click", function(event)
{
	var link = findParent(event.target, "a");
	if (link)
	{
		function unselect() { link.removeAttribute("selected"); }
		if (link.href && link.hash && link.hash != "#" && !link.target)
		{
			followAnchor(link);
		}
		else if (link == $("backButton"))
		{
			iui.goBack();
		}
		else if (link.getAttribute("type") == "submit")
		{
			var form = findParent(link, "form");
			if (form.target == "_self")
			{
				// Note: this will not call any onsubmit handlers!
			    form.submit();
			    return;  // allow default
			}
			submitForm(form);
		}
		else if (link.getAttribute("type") == "cancel")
		{
			cancelDialog(findParent(link, "form"));
		}
		else if (link.target == "_replace")
		{
			followAjax(link, link);
		}
		else if (iui.isNativeUrl(link.href))
		{
			return;
		}
		else if (link.target == "_webapp")
		{
			location.href = link.href;
		}
		else if (!link.target)
		{
			followAjax(link, null);
		}
		else
			return;
		
		event.preventDefault();		   
	}
}, true);

addEventListener("click", function(event)
{
	var div = findParent(event.target, "div");
	if (div && hasClass(div, "toggle"))
	{
		div.setAttribute("toggled", div.getAttribute("toggled") != "true");
		event.preventDefault();		   
	}
}, true);

function followAnchor(link)
{
	function unselect() { link.removeAttribute("selected"); }
	
	if (!iui.busy)
	{
		iui.busy = true;
		link.setAttribute("selected", "true");
		// We need to check for backlinks here like in showPageID()
		// That backlink functionality needs to be in here somewhere
		iui.showPage($(link.hash.substr(1)));
		setTimeout(unselect, 500);
	}
}

function followAjax(link, replaceLink)
{
	function unselect() { link.removeAttribute("selected"); }

	if (!iui.busy)
	{
		iui.busy = true;
		link.setAttribute("selected", "progress");
		iui.showPageByHref(link.href, null, "GET", replaceLink, unselect);	
	}
}

function sendEvent(type, node, props)
{
    if (node)
    {
        var event = document.createEvent("UIEvent");
        event.initEvent(type, false, false);  // no bubble, no cancel
        if (props)
        {
            for (i in props)
            {
                event[i] = props[i];
            }
        }
        node.dispatchEvent(event);
    }
}

function getPageFromLoc()
{
	var page;
	var result = location.hash.match(/#_([^\?_]+)/);
	if (result)
		page = result[1];
	if (page)
		page = $(page);
	return page;
}

function orientChangeHandler()
{
	var orientation=window.orientation;
	switch(orientation)
	{
	case 0:
		setOrientation(portraitVal);
		break;	
		
	case 90:
	case -90: 
		setOrientation(landscapeVal);
		break;
	}
}


function checkOrientAndLocation()
{
	if (!hasOrientationEvent)
	{
	  if ((window.innerWidth != currentWidth) || (window.innerHeight != currentHeight))
	  {	  
		  currentWidth = window.innerWidth;
		  currentHeight = window.innerHeight;
		  var orient = (currentWidth < currentHeight) ? portraitVal : landscapeVal;
		  setOrientation(orient);
	  }
	}

	if (location.hash != currentHash)
	{
		var pageId = location.hash.substr(hashPrefix.length);
		iui.showPageById(pageId);
	}
}

function setOrientation(orient)
{
	document.body.setAttribute("orient", orient);
//  Set class in addition to orient attribute:
	if (orient == portraitVal)
	{
		iui.removeClass(document.body, landscapeVal);
		iui.addClass(document.body, portraitVal);
	}
	else if (orient == landscapeVal)
	{
		iui.removeClass(document.body, portraitVal);
		iui.addClass(document.body, landscapeVal);
	}
	else
	{
		iui.removeClass(document.body, portraitVal);
		iui.removeClass(document.body, landscapeVal);
	}
	setTimeout(scrollTo, 100, 0, 1);
}

function showDialog(page)
{
	currentDialog = page;
	page.setAttribute("selected", "true");
	
	if (hasClass(page, "dialog"))
		showForm(page);
}

function showForm(form)
{
	form.onsubmit = function(event)
	{
//  submitForm and preventDefault are called in the click handler
//  when the user clicks the submit a.button
// 
		event.preventDefault();
		submitForm(form);
	};
	
	form.onclick = function(event)
	{
// Why is this code needed?  cancelDialog is called from
// the click hander.  When will this be called?
		if (event.target == form && hasClass(form, "dialog"))
			cancelDialog(form);
	};
}

function cancelDialog(form)
{
	form.removeAttribute("selected");
}

function updatePage(page, fromPage)
{
	if (!page.id)
		page.id = "__" + (++newPageCount) + "__";

	location.hash = currentHash = hashPrefix + page.id;
	pageHistory.push(page.id);

	var pageTitle = $("pageTitle");
	if (page.title)
		pageTitle.innerHTML = page.title;
	var ttlClass = page.getAttribute("ttlclass");
	pageTitle.className = ttlClass ? ttlClass : "";

	if (page.localName.toLowerCase() == "form" && !page.target)
		showForm(page);
		
	var backButton = $("backButton");
	if (backButton)
	{
		var prevPage = $(pageHistory[pageHistory.length-2]);
		if (prevPage && !page.getAttribute("hideBackButton"))
		{
			backButton.style.display = "inline";
			backButton.innerHTML = prevPage.title ? prevPage.title : "Back";
			var bbClass = prevPage.getAttribute("bbclass");
			backButton.className = (bbClass) ? 'button ' + bbClass : 'button';
		}
		else
			backButton.style.display = "none";
	}
	iui.busy = false;
}

function slidePages(fromPage, toPage, backwards)
{		 
	var axis = (backwards ? fromPage : toPage).getAttribute("axis");

	clearInterval(checkTimer);
	
	sendEvent("beforetransition", fromPage, {out:true});
	sendEvent("beforetransition", toPage, {out:false});
	if (canDoSlideAnim() && axis != 'y')
	{
	  slide2(fromPage, toPage, backwards, slideDone);
	}
	else
	{
	  slide1(fromPage, toPage, backwards, axis, slideDone);
	}

	function slideDone()
	{
	  if (!hasClass(toPage, "dialog"))
		  fromPage.removeAttribute("selected");
	  checkTimer = setInterval(checkOrientAndLocation, 300);
	  setTimeout(updatePage, 0, toPage, fromPage);
	  fromPage.removeEventListener('webkitTransitionEnd', slideDone, false);
	  sendEvent("aftertransition", fromPage, {out:true});
      sendEvent("aftertransition", toPage, {out:false});

	}
}

function canDoSlideAnim()
{
  return (iui.animOn) && (typeof WebKitCSSMatrix == "object");
}

function slide1(fromPage, toPage, backwards, axis, cb)
{
	if (axis == "y")
		(backwards ? fromPage : toPage).style.top = "100%";
	else
		toPage.style.left = "100%";

	scrollTo(0, 1);
	toPage.setAttribute("selected", "true");
	var percent = 100;
	slide();
	var timer = setInterval(slide, slideInterval);

	function slide()
	{
		percent -= slideSpeed;
		if (percent <= 0)
		{
			percent = 0;
			clearInterval(timer);
			cb();
		}
	
		if (axis == "y")
		{
			backwards
				? fromPage.style.top = (100-percent) + "%"
				: toPage.style.top = percent + "%";
		}
		else
		{
			fromPage.style.left = (backwards ? (100-percent) : (percent-100)) + "%"; 
			toPage.style.left = (backwards ? -percent : percent) + "%"; 
		}
	}
}


function slide2(fromPage, toPage, backwards, cb)
{
	toPage.style.webkitTransitionDuration = '0ms'; // Turn off transitions to set toPage start offset
	// fromStart is always 0% and toEnd is always 0%
	// iPhone won't take % width on toPage
	var toStart = 'translateX(' + (backwards ? '-' : '') + window.innerWidth +	'px)';
	var fromEnd = 'translateX(' + (backwards ? '100%' : '-100%') + ')';
	toPage.style.webkitTransform = toStart;
	toPage.setAttribute("selected", "true");
	toPage.style.webkitTransitionDuration = '';	  // Turn transitions back on
	function startTrans()
	{
		fromPage.style.webkitTransform = fromEnd;
		toPage.style.webkitTransform = 'translateX(0%)'; //toEnd
	}
	fromPage.addEventListener('webkitTransitionEnd', cb, false);
	setTimeout(startTrans, 0);
}

function preloadImages()
{
	var preloader = document.createElement("div");
	preloader.id = "preloader";
	document.body.appendChild(preloader);
}

function submitForm(form)
{
 	if (!iui.busy)
	{
		iui.busy = true;
		iui.addClass(form, "progress");
		iui.showPageByHref(form.action, encodeForm(form), form.method || "GET", null, clear);
	}
    function clear() {   iui.removeClass(form, "progress"); }
}

function encodeForm(form)
{
	function encode(inputs)
	{
		for (var i = 0; i < inputs.length; ++i)
		{
	        if (inputs[i].name)
		        args[inputs[i].name] = inputs[i].value;
		}
	}

    var args = {};
    encode(form.getElementsByTagName("input"));
    encode(form.getElementsByTagName("textarea"));
    encode(form.getElementsByTagName("select"));
    encode(form.getElementsByTagName("button"));
    return args;	  
}

function findParent(node, localName)
{
	while (node && (node.nodeType != 1 || node.localName.toLowerCase() != localName))
		node = node.parentNode;
	return node;
}

function hasClass(self, name)
{
	return iui.hasClass(self,name);
}

function replaceElementWithFrag(replace, frag)
{
	var page = replace.parentNode;
	var parent = replace;
	while (page.parentNode != document.body)
	{
		page = page.parentNode;
		parent = parent.parentNode;
	}
	page.removeChild(parent);

    var docNode;
	while (frag.firstChild) {
		docNode = page.appendChild(frag.firstChild);
		sendEvent("afterinsert", document.body, {insertedNode:docNode});
    }
	sendEvent("afterinsertend", document.body, {fragment:frag})
}

function $(id) { return document.getElementById(id); }
function ddd() { console.log.apply(console, arguments); }

})();
