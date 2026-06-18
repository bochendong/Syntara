;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname lab3-sol) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(require 2htdp/universe)

(@assignment 107/labs/lab-03)
(@cwl chenyanz) 

;; CPSC 107 - Balloon Lab

;; CONSTANTS ==========================

(define WIDTH 500)
(define HEIGHT 500)
(define MTS (empty-scene WIDTH HEIGHT))

(define BALLOON-COLOUR "red")
(define POP-IMAGE (overlay (text "POP!" 20 "black")
                           (radial-star 10 (/ WIDTH 30) (/ WIDTH 10)
                                        "solid"
                                        "yellow")))

(define CTR-X (/ WIDTH 2))
(define CTR-Y (/ HEIGHT 2))

(define SPEED 0.2)

(define MAX-SIZE (/ WIDTH 20))

(@htdw ListOfBalloon)
;; DATA DEFINITIONS ============================

(@problem 1)
;; PRE-LAB/Problem 1: Complete three data definitions according to
;; the following descriptions:
;; 1) State is the state of a balloon, and should either
;;    be "popped" (false) or an integer radius between 0
;;    and MAX-SIZE.
;; 2) Balloon is a single balloon, which should be
;;    represented by an x-coordinate, a y-coordinate,
;;    and a state. NOTE: Design Balloon so that 
;;    (make-balloon 1 2 false) creates a balloon at position
;;    (1, 2) that is "popped" (if you do not do this, you will
;;    receive a lower autograding score).
;; 3) ListOfBalloon is a list of balloons. When creating the
;;    data definition, DO NOT comment out the template or you 
;;    will receive a lower autograding score.

(@htdd State)
;; State is one of:
;; - Number (>= 0 and <= MAX-SIZE)
;; - false
;; interp. the current state of a balloon, either popped or with a size
(define S1 false)
(define S2 4.2)
(define S3 0.0)

(@dd-template-rules one-of
                    atomic-distinct
                    atomic-non-distinct)
(define (fn-for-state s)
  (cond [(false? s) (...)]
        [else (... s)]))

(@htdd Balloon)
(define-struct balloon (x y state))
;; Ballon is (make-balloon Number Number state)
;; interp. the x, y position of a Balloon in a screen coordinates and state.

(define B1 (make-balloon 100 50 S1))
(define B2 (make-balloon 20 30 S2))
(define B3 (make-balloon 20 30 3.2))


(@dd-template-rules compound
                    ref) ;3 fields


(define (fn-for-balloon b)
  (... (balloon-x b)    ;Number
       (balloon-y b)    ;Number
       (fn-for-state (balloon-state b ))))  ;State


(@htdd ListOfBalloon)
;; ListOfBalloon is one of:
;; - empty
;; - (cons Balloon ListOfBalloon)
;; interp. a list of balloon
(define LOB1 empty)
(define LOB2 (cons B1 empty))
(define LOB3 (cons B1 (cons B2 empty)))


(@dd-template-rules one-of           ;2 cases
                    atomic-distinct  ;empty
                    compound         ;cons
                    ref              ;(first lob) is Balloon
                    self-ref)        ;(rest lob) is ListOfBalloon

(define (fn-for-lob lob)
  (cond [(empty? lob) (...)]
        [else
         (... (fn-for-balloon (first lob))
              (fn-for-lob (rest lob)))]))


;; FUNCTIONS ====================================

;; ListOfBalloon ->ListOfBalloon
;; starts the world program with an empty list of balloons 
; no examples for main function
(@htdf main)
(@signature ListOfBalloon -> ListOfBalloon)
(@template-origin htdw-main)
(define (main lob)
  (big-bang lob
    (on-tick tick)
    (on-mouse add)
    (to-draw render)))

;; Problem 2: Design a function called tick, which
;; will update the state of all the balloons every time
;; the program's clock ticks. The function will take
;; in a ListOfBalloon and produces a ListOfBalloon where
;; every balloon's radius grows by SPEED or is popped.
(@problem 2)
(@htdf tick)
(@signature ListOfBalloon -> ListOfBalloon)
;; update each balloon: grow its radius by SPEED, or pop it if too big
(check-expect (tick empty) empty)
(check-expect (tick (cons (make-balloon 10 10 false) empty))
              (cons (make-balloon 10 10 false) empty))
(check-expect (tick (cons (make-balloon 10 10 false)
                          (cons (make-balloon 20 20 0) empty)))
              (cons (make-balloon 10 10 false)
                    (cons (make-balloon 20 20 0.2) empty)))
(check-expect (tick (cons (make-balloon 30 30 24.9) empty))
              (cons (make-balloon 30 30 false) empty))


;(define (tick lob) lob) ; stub

(@template-origin ListOfBalloon)
(@template
 (define (tick lob)
   (cond [(empty? lob) (...)]
         [else
          (... (first lob)
               (tick (rest lob)))])))

(define (tick lob)
  (cond [(empty? lob) empty]
        [else (cons (update-balloon (first lob))
                    (tick (rest lob)))]))

(@htdf update-balloon)
(@signature Balloon -> Balloon)
;; update a single balloon's size or pop it
(check-expect (update-balloon (make-balloon 10 10 false))
              (make-balloon 10 10 false))
(check-expect (update-balloon (make-balloon 10 10 MAX-SIZE))
              (make-balloon 10 10 false))
(check-expect (update-balloon (make-balloon 10 10 24.8))
              (make-balloon 10 10 25))
(check-expect (update-balloon (make-balloon 10 10 5.0))
              (make-balloon 10 10 (+ 5.0 SPEED)))
(check-expect (update-balloon (make-balloon 10 10 (- MAX-SIZE 0.1)))
              (make-balloon 10 10 false))

;(define (update-balloon b) b) ; stub

(@template-origin Balloon)
(@template
 (define (update-balloon b)
   (... (balloon-x b)
        (balloon-y b)
        (balloon-state b))))

(define (update-balloon b)
  (cond [(false? (balloon-state b)) b]
        [(> (+ (balloon-state b) SPEED) MAX-SIZE)
         (make-balloon (balloon-x b) (balloon-y b) false)]
        [else
         (make-balloon (balloon-x b)
                       (balloon-y b)
                       (+ (balloon-state b) SPEED))]))



;; The following function is provided for you. It
;; takes in a ListOfBalloon and adds a balloon
;; to it at the position of a mouse click.
(@htdf add)
(@signature ListOfBalloon -> ListOfBalloon)
;; adds a new balloon to the screen where cursor clicks
(check-expect (add empty 50 50 "button-down")
              (cons (make-balloon 50 50 0) empty))

;(define (add lob x y me) lob) ;stub

(@template-origin MouseEvent)
(define (add lob x y me)
  (if (mouse=? me "button-down")
      (cons (make-balloon x y 0) lob)
      lob))


;; Problem 3: Design a function called render which renders
;; a list of balloons onto the screen. A balloon with a
;; radius can be represented on the screen simple as a
;; circle with the given position and radius. A popped
;; balloon can be represented using the POP-IMAGE constant
;; we provided for you.
(@problem 3)
(@htdf render)
(@signature ListOfBalloon -> Image)
;; render all balloons in the list onto the scene
(check-expect (render empty) MTS)
(check-expect (render (cons (make-balloon 100 100 false) empty))
              (place-image POP-IMAGE 100 100 MTS))
(check-expect (render (cons (make-balloon 100 100 10) empty))
              (place-image (circle 10 "solid" BALLOON-COLOUR) 100 100 MTS))
(check-expect (render (cons (make-balloon 100 100 0) empty))
              (place-image (circle 0 "solid" BALLOON-COLOUR) 100 100 MTS))
(check-expect (render (cons (make-balloon 200 200 0) empty))
              (place-image (circle 0 "solid" BALLOON-COLOUR) 200 200 MTS))
(check-expect (render (cons (make-balloon 200 200 26) empty))
              (place-image (circle 26 "solid" BALLOON-COLOUR) 200 200 MTS))
(check-expect (render (cons (make-balloon 0 0 10) empty))
              (place-image (circle 10 "solid" BALLOON-COLOUR) 0 0 MTS))
(check-expect (render (cons (make-balloon 0 HEIGHT 0) empty))
              (place-image (circle 0 "solid" BALLOON-COLOUR) 0 HEIGHT MTS))
(check-expect (render (cons (make-balloon WIDTH HEIGHT false) empty))
              (place-image POP-IMAGE WIDTH HEIGHT MTS))
(check-expect (render (cons (make-balloon 0 HEIGHT 10) empty))
              (place-image (circle 10 "solid" BALLOON-COLOUR) 0 HEIGHT MTS))
(check-expect (render (cons (make-balloon 100 100 MAX-SIZE) empty))
              (place-image (circle MAX-SIZE "solid" BALLOON-COLOUR)
                           100 100 MTS))
(check-expect (render (cons (make-balloon -20 -30 15) empty))
              (place-image (circle 15 "solid" BALLOON-COLOUR) -20 -30 MTS))


;(define (render lob) MTS) ; stub

(@template-origin ListOfBalloon)
(@template
 (define (render lob)
   (cond [(empty? lob) (...)]
         [else (... (first lob)
                    (render (rest lob)))])))

(define (render lob)
  (cond [(empty? lob) MTS]
        [else (render-balloon (first lob)
                              (render (rest lob)))]))

(@htdf render-balloon) 
(@signature Balloon Image -> Image)
;; draw one balloon (popped or inflated) on a given image
(check-expect (render-balloon (make-balloon 100 100 false) MTS)
              (place-image POP-IMAGE 100 100 MTS))
(check-expect (render-balloon (make-balloon 150 150 15) MTS)
              (place-image (circle 15 "solid" BALLOON-COLOUR) 150 150 MTS))
(check-expect (render-balloon (make-balloon 100 100 MAX-SIZE) MTS)
              (place-image (circle MAX-SIZE "solid"
                                   BALLOON-COLOUR) 100 100 MTS))
(check-expect (render (list (make-balloon -20 -30 15)))
              (place-image (circle 15 "solid" BALLOON-COLOUR) -20 -30 MTS))

;(define (render-balloon b img) img) ; stub

(define (render-balloon b img)
  (place-image
   (if (false? (balloon-state b)) 
       POP-IMAGE
       (circle (balloon-state b) "solid" BALLOON-COLOUR))
   (balloon-x b) 
   (balloon-y b) 
   img))