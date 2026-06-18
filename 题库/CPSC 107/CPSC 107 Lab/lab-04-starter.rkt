;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname 107-lab-04-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(require 2htdp/universe)

(@assignment 107/labs/lab-04)
(@cwl ???) 

;; CPSC 107 - Sink Lab

(@problem 1)
;; Problem 1
;;
;; Consider a test tube filled with solid blobs and bubbles.  Over time the
;; solids sink to the bottom of the test tube, and as a consequence the bubbles
;; percolate to the top. 
;;
;; Complete the design of a world program that displays the test tube of blobs.
;; Initially, the test tube is empty, but we can add solid blobs and bubbles by
;; pressing the "s" and "b" keys respectively. Pressing the spacebar will sink
;; each solid blob by one.
;;
;; We have completed most of this program already. All you will need to do is
;; complete the sink function (a helper function for handle-key). This function
;; will consume a list of blobs and sinks each solid blob by one. You can assume
;; that a solid blob will sink past any neighbour just below it.

(@htdw ListOfBlob)
;; CONSTANTS ============================


(define WIDTH 300)
(define HEIGHT 500)


(define TUBE-WIDTH 50)
(define TUBE (overlay/align/offset "middle" "bottom"
                                   (rectangle TUBE-WIDTH (- HEIGHT TUBE-WIDTH) 
                                              "solid"
                                              "silver")
                                   0 (/ TUBE-WIDTH 2)
                                   (circle (/ TUBE-WIDTH 2) "solid" "silver")))

(define MTS (overlay/align "middle" "bottom"
                           TUBE
                           (empty-scene WIDTH HEIGHT)))

(define X-CTR (/ WIDTH 2))

(define BLOB-RADIUS (* 0.4 TUBE-WIDTH))
(define SOLID (circle BLOB-RADIUS "solid" "black"))
(define BUBBLE (circle BLOB-RADIUS "outline" "blue"))


;; DATA DEFINITIONS ====================

(@htdd Blob)
;; Blob is one of:
;; - "solid"
;; - "bubble"
;; interp.  a gelatinous blob, either a solid or a bubble
;; Examples are redundant for enumerations

(@dd-template-rules one-of atomic-distinct atomic-distinct)
(define (fn-for-blob b)
  (cond [(string=? b "solid") (...)]
        [(string=? b "bubble") (...)]))


(@htdd ListOfBlob)
;; ListOfBlob is one of:
;; - empty
;; - (cons Blob ListOfBlob)
;; interp. a sequence of blobs in a test tube, listed from top to bottom.
(define LOB0 empty) ; empty test tube
(define LOB2 (cons "solid" (cons "bubble" empty))) ; solid blob above a bubble

(@dd-template-rules one-of atomic-distinct compound ref self-ref)
(define (fn-for-lob lob)
  (cond [(empty? lob) (...)]
        [else
         (... (fn-for-blob (first lob))
              (fn-for-lob (rest lob)))]))


;; FUNCTIONS ===========================

(@htdf main)
(@signature ListOfBlob -> ListOfBlob)
;; start the world program with (main empty)

(@template-origin htdw-main)
(define (main lob)
  (big-bang lob
    (to-draw render-lob)
    (on-key  handle-key)))



(@htdf render-lob)
(@signature ListOfBlob -> Image)
;; renders the list of blobs on MTS
(check-expect (render-lob empty) MTS)
(check-expect (render-lob (cons "bubble"
                                (cons "solid"
                                      (cons "bubble" empty))))
              (overlay/align "middle" "bottom"
                             (above BUBBLE SOLID BUBBLE)
                             MTS))

(@template-origin fn-composition)
(define (render-lob lob)
  (overlay/align "middle" "bottom"
                 (render-blobs lob)
                 MTS))

(@htdf render-blobs)
(@signature ListOfBlob -> Image)
;; renders the list of blobs in vertical line
(check-expect (render-blobs empty) empty-image)
(check-expect (render-blobs (cons "bubble" (cons "solid" (cons "solid" empty))))
              (above BUBBLE SOLID SOLID))

(@template-origin ListOfBlob)
(define (render-blobs lob)
  (cond [(empty? lob) empty-image]
        [else
         (above (render-blob (first lob))
                (render-blobs (rest lob)))]))

(@htdf render-blob)
(@signature Blob -> Image)
;; produce the image for the given blob
(check-expect (render-blob "bubble") BUBBLE)
(check-expect (render-blob "solid") SOLID)

(@template-origin Blob)
(define (render-blob b)
  (cond [(string=? b "solid") SOLID]
        [(string=? b "bubble") BUBBLE]))


(@htdf handle-key)
(@signature ListOfBlob KeyEvent -> ListOfBlob)
;; add blobs on "s", "b" and sink on " "
(check-expect (handle-key (cons "bubble" (cons "solid" empty)) "s")
              (cons "solid" (cons "bubble" (cons "solid" empty))))
(check-expect (handle-key (cons "bubble" empty) "b")
              (cons "bubble" (cons "bubble" empty)))
(check-expect (handle-key (cons "solid" (cons "bubble" empty)) " ")
              (cons "bubble" (cons "solid" empty)))

(@template-origin KeyEvent)
(define (handle-key lob ke)
  (cond [(key=? "s" ke) (cons "solid" lob)]
        [(key=? "b" ke) (cons "bubble" lob)]
        [(key=? " " ke) (sink lob)]
        [else lob]))


;; !!!
(@htdf sink)
(@signature ListOfBlob -> ListOfBlob)
;; produce a list of blobs that sinks the given solid blobs by one
(check-expect (sink empty) empty)
(check-expect (sink (cons "bubble" (cons "solid" (cons "bubble" empty))))
              (cons "bubble" (cons "bubble" (cons "solid" empty))))
(check-expect (sink (cons "solid" (cons "solid" (cons "bubble" empty))))
              (cons "bubble" (cons "solid" (cons "solid" empty))))
(check-expect (sink (cons "solid" (cons "bubble" (cons "bubble" empty))))
              (cons "bubble" (cons "solid" (cons "bubble" empty))))

;; PRE-LAB
;; Complete these three check-expects, then uncomment them.

;(check-expect (sink (cons "solid" (cons "bubble" (cons "solid" empty))))
;              ...)
;(check-expect (sink (cons "bubble" (cons "solid" (cons "solid" empty))))
;              ...)
;(check-expect (sink (cons "solid"
;                          (cons "solid"
;                                (cons "bubble" (cons "bubble" empty)))))
;              ...)


(define (sink lob) lob) ;stub

















