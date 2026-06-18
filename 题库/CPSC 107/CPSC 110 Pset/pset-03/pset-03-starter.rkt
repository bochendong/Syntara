;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname pset-03-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require 2htdp/image)
(require 2htdp/universe)
(require spd/tags)

(@assignment psets/pset-03);Do not edit or remove this tag

(@cwl ??? ???)

(@problem 1)
(@htdw Ball)

;; Constants:
(define WIDTH  605)
(define HEIGHT 535)

(define BALL-RADIUS 10)

(define TOP (+ 0        BALL-RADIUS)) ;these constants define the "inner box"
(define BOT (- HEIGHT 1 BALL-RADIUS)) ;that constrains the center of the ball
(define LEF (+ 0        BALL-RADIUS)) ;
(define RIG (- WIDTH  1 BALL-RADIUS)) ;

(define BALL (circle BALL-RADIUS "solid" "white"))

(define MTS (rectangle WIDTH HEIGHT "solid" "green"))


;; ===========================================================================
;; ===========================================================================
;; Data definitions:

(@htdd Ball)

(define-struct ball (x y dx dy))
;; Ball is (make-ball Number Number Number Number)
;; interp. (make-ball x y dx dy) is ball
;;   - position x, y    in screen coordinates
;;   - velocity dx, dy  in pixels/tick
(define B1 (make-ball (/ WIDTH 2) (/ HEIGHT 2) 4 -3))

(@dd-template-rules compound)

(define (fn-for-ball b)
  (... (ball-x b) 
       (ball-y b) 
       (ball-dx b) 
       (ball-dy b)))



;; ===========================================================================
;; ===========================================================================
;; Functions:

(@htdf main)
(@signature Ball -> Ball)
;; start the game, call with (main B1)
;; <no tests for main functions>

(@template-origin htdw-main)

(define (main b)
  (big-bang b
    (on-draw   render-ball)   ;Ball -> Image
    (on-tick   next-ball)     ;Ball -> Ball
    (on-mouse  handle-mouse)));Ball Integer Integer MouseEvent -> Ball
            



(@htdf render-ball)
(@signature Ball -> Image)
;; place BALL on image at appropriate x, y coordinate
;;


                              

(define (render-ball b) MTS))



(@htdf next-ball)
(@signature Ball -> Ball)
;; produce ball at next x,y; checks bounces off top/right/bottom/left wall
(check-expect (next-ball     (make-ball (+ LEF 1) TOP  3 -4))
              (bounce-top    (make-ball (+ LEF 1) TOP  3 -4)))
(check-expect (next-ball     (make-ball (+ LEF 1) BOT  3  4))
              (bounce-bottom (make-ball (+ LEF 1) BOT  3  4)))
(check-expect (next-ball     (make-ball LEF (+ TOP 1) -3 4))
              (bounce-left   (make-ball LEF (+ TOP 1) -3 4)))
(check-expect (next-ball     (make-ball RIG (+ TOP 1)  3 4))
              (bounce-right  (make-ball RIG (+ TOP 1)  3 4)))
(check-expect (next-ball     (make-ball (/ WIDTH 2) (/ HEIGHT 2) 3 4))
              (glide         (make-ball (/ WIDTH 2) (/ HEIGHT 2) 3 4)))
#;
(define (next-ball b) b)

(@template-origin Number) ;b is treated as atomic

(@template
 (define (next-ball b)
   (... b)))

(define (next-ball b)
  (cond [(touch-top?    b) (bounce-top b)]
        [(touch-bottom? b) (bounce-bottom b)]
        [(touch-right?  b) (bounce-right b)]
        [(touch-left?   b) (bounce-left b)]
        [else
         (glide b)]))


(@htdf handle-mouse)
(@signature Ball Integer Integer MouseEvent -> Ball)
;; replace ball with new ball on mouse click
;; NOTE: uses random, so testing has to use check-random
(check-random (handle-mouse (make-ball 1 2 3 4) 100 200 "button-down")
              (make-ball 100 200 (- 5 (random 11)) (- 5 (random 11))))
(check-random (handle-mouse (make-ball 1 2 3 4) 100 200 "button-up")
              (make-ball 1 2 3 4))
#;
(define (handle-mouse b x y me) b)

(@template-origin MouseEvent)

(@template
 (define (handle-mouse b x y me)
   (cond [(mouse=? me "button-down") (... b x y)]
         [else
          (... b x y)])))

(define (handle-mouse b x y me)
  (cond [(mouse=? me "button-down")
         (make-ball x y (- 5 (random 11)) (- 5 (random 11)))]
        [else b]))
        

(@htdf touch-top?)
(@signature Ball -> Boolean)
;; true if ball is going up and edge will hit or pass top edge of box
(check-expect (touch-top?    (make-ball LEF (+ TOP  5) 3 -4)) false)
(check-expect (touch-top?    (make-ball LEF (+ TOP  4) 3 -4)) true)
(check-expect (touch-top?    (make-ball LEF (+ TOP  1) 3 -2)) true)
(check-expect (touch-top?    (make-ball LEF (+ TOP  0) 3  2)) false)
#;
(define (touch-top? b) false)

(@template-origin Ball)

(@template
 (define (touch-top? b)
   (... (ball-x b) 
        (ball-y b) 
        (ball-dx b) 
        (ball-dy b))))

(define (touch-top? b)
  (<= (+ (ball-y b) (ball-dy b)) TOP))


(@htdf touch-bottom?)
(@signature Ball -> Boolean)
;; true if ball going down and edge will touch or pass bottom edge of box
;; !!!
(define (touch-bottom? b) false)


(@htdf touch-left?)
(@signature Ball -> Boolean)
;; true if ball going left and edge will touch or pass left edge of box
;; !!!
(define (touch-left? b) false)


(@htdf touch-right?)
(@signature Ball -> Boolean)
;; true if ball going right and edge will touch or pass right edge of box
;; !!!
(define (touch-right? b) false)


(@htdf bounce-top)
(@signature Ball -> Ball)
;; produce a ball with top edge 1 pixel off top of box, moving down
;; CONSTRAINT: assume ball is close to top edge and moving up
(check-expect (bounce-top (make-ball (+ LEF 1) (+ TOP 3) 2 -4))
              (make-ball (+ LEF 1) (+ TOP 1) 2  4))
(check-expect (bounce-top (make-ball (+ LEF 2) (+ TOP 6) 3 -7))
              (make-ball (+ LEF 2) (+ TOP 1) 3 7))
#;
(define (bounce-top b) b)

(@template-origin Ball)

(@template
 (define (bounce-top b)
   (... (ball-x b) 
        (ball-y b) 
        (ball-dx b) 
        (ball-dy b))))

(define (bounce-top b)
  (make-ball (ball-x b) (+ TOP 1) (ball-dx b) (- (ball-dy b))))


(@htdf bounce-bottom)
(@signature Ball -> Ball)
;; produce a ball that has bounced 1 pixel off of bottom edge of the box
;; CONSTRAINT: assume ball is close to bottom edge and moving down
;; !!!
(define (bounce-bottom b) b)


(@htdf bounce-left)
(@signature Ball -> Ball)
;; produce a ball that has bounced 1 pixel off of left edge of the box
;; CONSTRAINT: assume ball is close to left edge and moving left
;; !!!
(define (bounce-left b) b)


(@htdf bounce-right)
(@signature Ball -> Ball)
;; produce a ball that has bounced 1 pixel off of right edge of the box
;; CONSTRAINT: assume ball is close to right edge and moving right
;; !!!
(define (bounce-right b) b)



(@htdf glide)
(@signature Ball -> Ball)
;; move ball by dx dy
;; CONSTRAINT: ball is not touching or about to touch any edge of the box
;; !!!
(define (glide b) b)
