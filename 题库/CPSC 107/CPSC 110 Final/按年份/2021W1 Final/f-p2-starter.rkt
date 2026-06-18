;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)
(require 2htdp/universe)

(@assignment exams/2021w1-f/f-p2)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag

#|

BE SURE TO READ THE PROBLEM DIRECTIONS SEVERAL TIMES CAREFULLY BEFORE YOU
START.  IT IS VERY IMPORTANT THAT YOUR PROGRAM HAVE THE CORRECT BEHAVIOUR,
AND IT IS VERY IMPORTANT THAT IT HAVE **ALL** THE CORRECT BEHAVIOUR.

Below is a somewhat simplified version of the spider world program we developed
in lecture. In this version of the program there is no on-key function, so it
is not possible to change the direction of the spider by pressing the space key.
But the spider does have the behaviour of automatically changing direction when
it gets to the top or bottom of the window.

RUN THE FILE NOW.  You can start it with (main S-TOP-D). Let the spider travel
and bounce to see what behaviour it has.

In this problem you must make a systematic change to the program. Currently,
this version has only ONE spider. You must update it to allow an arbitrary
number of spiders. Clicking the mouse on the window should add a new spider at
the mouse x, y; the new spider should be moving down the screen at 3 pixels per
tick. So at any point in time there can be a number of spiders with different x
coordinates moving up and down the screen. Do not worry about the case where two
spiders have the same x coordinate, you can allow that to happen. There is no
mechanism for removing spiders; there are more and more spiders as the user
clicks the mouse to add them, only increasing in number.

NOTE THE FOLLOWING:

- It is very important that you work carefully and systematically. We want
  the whole program updated so that it looks as if the arbitrary
  number of spiders functionality had been there from the beginning.  Be
  sure to update any comments, signatures, tests, and anything else that needs
  to be updated.

- You must use built-in abstract functions in big-bang handlers where
  appropriate. You must not use recursion in any big-bang handlers.

- To save you some time we are allowing you to have spiders that are
  partially cut off at any edges. This means that when the mouse is
  clicked you should just use the mouse x and y coordinates,
  ignoring whether they are too close to any edge. The spider may remain
  partially cut off on the left or right edge, which is fine. You need no
  constraint on the x coordinate. If the spider starts cut off on the top or
  bottom, the existing tock function will fix the y coordinate at the next on
  tick.
|#


;; Spider, goes down screen with thread, changes dir at top/bottom

(@htdw Spider)

;; =================
;; Constants:

(define WIDTH 400)
(define HEIGHT 400)

(define CTR-X (/ WIDTH 2))

(define SPIDER-RADIUS 10)

(define TOP (+ 0      SPIDER-RADIUS)) ;to be entirely visible
(define BOT (- HEIGHT SPIDER-RADIUS)) ;center has to be in [TOP, BOT]

(define MID (/ HEIGHT 2))


(define SPIDER-IMAGE (circle SPIDER-RADIUS "solid" "black"))

(define MTS (empty-scene WIDTH HEIGHT))


;; =================
;; Data definitions:

(@htdd Spider)
(define-struct spider (y dy))
;; Spider is (make-spider Number Number)
;; interp. y is spider's vertical position in screen coordinates (pixels)
;;         dy is velocity in pixels per tick, + is down, - is up
;; CONSTRAINT: to be visible, must be in
;;             [TOP, BOT] which is [SPIDER-RADIUS, HEIGHT - SPIDER-RADIUS]
(define S-TOP-D (make-spider TOP  3))   ;top going down
(define S-MID-D (make-spider MID  3))   ;middle going down
(define S-MID-U (make-spider MID -3))   ;middle going up
(define S-BOT-U (make-spider BOT -3))   ;bottom going up


(@dd-template-rules compound) ;2 fields

(define (fn-for-spider s)
  (... (spider-y s)
       (spider-dy s)))


;; =================
;; Functions:

(@htdf main)
(@signature Spider -> Spider) 
;; start the world with (main S-TOP-D)

(@template-origin htdw-main)

(define (main s)
  (big-bang s                  ; Spider
    (on-tick   tock)           ; Spider -> Spider
    (to-draw   render)         ; Spider -> Image
    ; !!! NOTE - TO SAVE YOU TIME WE HAVE    
    ; Put the part of the big-bang template for a mouse handler
    ; here, and we chose the name of the on mouse-function we
    ; want you to use.
    ; We also put the beginning of the handle-mouse function
    ; design at the end of the file, and it includes another
    ; helpful hint for you.
    ; You should delete this comment, and uncomment the next
    ; line when you start on the mouse functionality.
    ;(on-mouse handle-mouse)   ; WS Integer Integer MouseEvent ->
    ;;                         ;     -> WS
    ))

(@htdf tock)
(@signature Spider -> Spider)
;; move spider by dy, except change direction at bottom and top edges

;; in the middle, doesn't hit anything
(check-expect (tock S-MID-D)
              (make-spider (+ (spider-y S-MID-D) (spider-dy S-MID-D))
                           (spider-dy S-MID-D)))
(check-expect (tock S-MID-U)
              (make-spider (+ (spider-y S-MID-U) (spider-dy S-MID-U))
                           (spider-dy S-MID-U)))
;; top edge
(check-expect (tock (make-spider (+ TOP 3) -2)) (make-spider (+ TOP 1) -2))
(check-expect (tock (make-spider (+ TOP 3) -3)) (make-spider    TOP     3))
(check-expect (tock (make-spider (+ TOP 3) -4)) (make-spider    TOP     4))

;; bottom edge
(check-expect (tock (make-spider (- BOT 3) 2))  (make-spider (- BOT 1)  2))
(check-expect (tock (make-spider (- BOT 3) 3))  (make-spider    BOT    -3))
(check-expect (tock (make-spider (- BOT 3) 4))  (make-spider    BOT    -4))

;(define (tock s) s) ;stub

(@template-origin Spider)

(define (tock s)
  (cond [(<= (+ (spider-y s) (spider-dy s)) TOP)
         (make-spider TOP (- (spider-dy s)))]
        [(>= (+ (spider-y s) (spider-dy s)) BOT)
         (make-spider BOT (- (spider-dy s)))]
        [else
         (make-spider (+ (spider-y s) (spider-dy s))
                      (spider-dy s))]))
        

(@htdf render)
(@signature Spider -> Image) 
;; place SPIDER-IMAGE and thread image on MTS, at spider's y coordinate
(check-expect (render S-MID-D)
              (add-line (place-image SPIDER-IMAGE CTR-X (spider-y S-MID-D) MTS)
                        CTR-X 0
                        CTR-X (spider-y S-MID-D)
                        "black"))

(check-expect (render (make-spider 36 -10))
              (add-line (place-image SPIDER-IMAGE CTR-X 36 MTS)
                        CTR-X 0
                        CTR-X 36
                        "black"))

;(define (render s) MTS)

(@template-origin Spider)
  
(define (render s)
  ;; first place SPIDER-IMAGE on MTS, and then add line to result of that
  (add-line (place-image SPIDER-IMAGE
                         CTR-X
                         (spider-y s)
                         MTS)
            CTR-X 0
            CTR-X (spider-y s)
            "black"))

;(@htdf handle-mouse)
;(@signature WS Integer Integer MouseEvent -> WS)
;; on button down add new spider at mouse x, y moving down 3 pixels per tick

;; REMINDER the MouseEvent for clicking the mouse is "button-down"
