;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname spider-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(require 2htdp/universe)

(@assignment exams/2021w1-f/f-p2)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag

(@htdw (listof Spider))

;; =================
;; Constants:

(define WIDTH 400)
(define HEIGHT 600)

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
(define-struct spider (x y dy))
;; Spider is (make-spider Number Number Number)
;; interp. x is spider's horizontal position in screen coordinates (pixels)
;;         y is spider's vertical position in screen coordinates (pixels)
;;         dy is velocity in pixels per tick, + is down, - is up
;; CONSTRAINT: to be visible, y must be in
;;             [TOP, BOT] which is [SPIDER-RADIUS, HEIGHT - SPIDER-RADIUS]
(define S-TOP-D (make-spider 10 TOP  3))   ;top going down
(define S-MID-D (make-spider 20 MID  3))   ;middle going down
(define S-MID-U (make-spider 20 MID -3))   ;middle going up
(define S-BOT-U (make-spider 30 BOT -3))   ;bottom going up


(@dd-template-rules compound);3 fields

(define (fn-for-spider s)
  (... (spider-x s)
       (spider-y s)
       (spider-dy s)))


;; =================
;; Functions:

(@htdf main)
(@signature (listof Spider) -> (listof Spider))
;; start the world with (main empty)

(@template-origin htdw-main)

(define (main s)
  (big-bang s                    ; (listof Spider)
    (on-tick   tock-los)         ; (listof Spider) -> (listof Spider)
    (to-draw   render-los)       ; (listof Spider) -> Image
    (on-mouse  handle-mouse)))   ; (listof Spider) Integer Integer MouseEvent
;                                ;        -> (listof Spider)


(@htdf tock-los)
(@signature (listof Spider) -> (listof Spider))
;; tock every spider in los
(check-expect (tock-los empty) empty)
(check-expect (tock-los (list S-MID-D S-MID-U))
              (list (tock S-MID-D) (tock S-MID-U)))

(@template-origin use-abstract-fn)

(define (tock-los los) (map tock los))

(@htdf tock)
(@signature Spider -> Spider)
;; move spider by dy, except change direction at bottom and top edges

;; don't hit boundaries
(check-expect (tock S-MID-D)
              (make-spider (spider-x S-MID-D)
                           (+ (spider-y S-MID-D) (spider-dy S-MID-D))
                           (spider-dy S-MID-D)))
(check-expect (tock S-MID-U)
              (make-spider (spider-x S-MID-U)
                           (+ (spider-y S-MID-U) (spider-dy S-MID-U))
                           (spider-dy S-MID-U)))
;; top edge
(check-expect (tock (make-spider 2 (+ TOP 3) -2)) (make-spider 2 (+ TOP 1) -2))
(check-expect (tock (make-spider 3 (+ TOP 3) -3)) (make-spider 3    TOP     3))
(check-expect (tock (make-spider 4 (+ TOP 3) -4)) (make-spider 4    TOP     4))

;; bottom edge
(check-expect (tock (make-spider 2 (- BOT 3) 2))  (make-spider 2 (- BOT 1)  2))
(check-expect (tock (make-spider 3 (- BOT 3) 3))  (make-spider 3    BOT    -3))
(check-expect (tock (make-spider 4 (- BOT 3) 4))  (make-spider 4    BOT    -4))

;(define (tock s) s) ;stub

(@template-origin Spider)

(define (tock s)
  (cond [(<= (+ (spider-y s) (spider-dy s)) TOP)
         (make-spider (spider-x s) TOP (- (spider-dy s)))]
        [(>= (+ (spider-y s) (spider-dy s)) BOT)
         (make-spider (spider-x s)  BOT (- (spider-dy s)))]
        [else
         (make-spider (spider-x s)
                      (+ (spider-y s) (spider-dy s))
                      (spider-dy s))]))
        

(@htdf render-los)
(@signature (listof Spider) -> Image)
;; render each spider in los at appropriate position on MTS
(check-expect (render-los empty) MTS)
(check-expect (render-los (list (make-spider 10 20 3) (make-spider 30 40 5)))
              (add-line (place-image SPIDER-IMAGE 10 20
                                     (add-line (place-image SPIDER-IMAGE 30 40
                                                            MTS)
                                               30 0
                                               30 40
                                               "black"))
                        10 0
                        10 20
                        "black"))

(@template-origin use-abstract-fn)

(define (render-los los)
  (foldr (lambda (s rnr)
           (add-line (place-image SPIDER-IMAGE (spider-x s) (spider-y s) rnr)
                     (spider-x s) 0
                     (spider-x s) (spider-y s)
                     "black"))
         MTS
         los))

(@htdf handle-mouse)
(@signature (listof Spider) Integer Integer MouseEvent -> (listof Spider))
;; on button down add new spider at mouse x, y moving down 3 pixels per tick
(check-expect (handle-mouse (list S-MID-D) 40 50 "button-down")
              (list (make-spider 40 50 3) S-MID-D))
(check-expect (handle-mouse (list S-MID-D) 40 50 "drag")
              (list S-MID-D))

(@template-origin MouseEvent)

(define (handle-mouse los x y me)
  (cond [(mouse=? me "button-down") (cons (make-spider x y 3) los)]
        [else los]))
